-- Live Cloudflare webinars send "after start" and "after end" reminders from
-- the real broadcast, not from the planned start plus a guessed duration.
-- YouTube and automated webinars keep the duration clock.

alter table public.webinars
  add column if not exists broadcast_started_at timestamptz,
  add column if not exists broadcast_ended_at timestamptz;

comment on column public.webinars.broadcast_started_at is
  'When the live video actually started. After-start reminders use this.';
comment on column public.webinars.broadcast_ended_at is
  'When the host stopped the live video. After-end reminders use this.';

create or replace function public.reminder_uses_broadcast_clock(
  p_type text,
  p_provider text
) returns boolean
language sql
immutable
as $$
  select p_type = 'live' and coalesce(p_provider, 'cloudflare') = 'cloudflare';
$$;
revoke all on function public.reminder_uses_broadcast_clock(text, text) from public;

create or replace function public.reminder_schedule_at(
  p_type text,
  p_provider text,
  p_timing text,
  p_offset_minutes integer,
  p_session_start timestamptz,
  p_duration_minutes integer,
  p_broadcast_started timestamptz,
  p_broadcast_ended timestamptz
) returns timestamptz
language sql
immutable
as $$
  select case
    when public.reminder_uses_broadcast_clock(p_type, p_provider)
      and p_timing = 'after_start' then
      case
        when p_broadcast_started is null then null
        else p_broadcast_started + make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
      end
    when public.reminder_uses_broadcast_clock(p_type, p_provider)
      and p_timing = 'after_end' then
      case
        when p_broadcast_ended is null then null
        else p_broadcast_ended + make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
      end
    else public.reminder_run_at(
      p_session_start,
      p_duration_minutes,
      p_timing,
      p_offset_minutes
    )
  end;
$$;
revoke all on function public.reminder_schedule_at(text, text, text, integer, timestamptz, integer, timestamptz, timestamptz) from public;

create or replace function public.enqueue_reminders_for_registration(p_registration_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webinar_id uuid;
  v_starts_at timestamptz;
  v_duration integer;
  v_type text;
  v_provider text;
  v_started timestamptz;
  v_ended timestamptz;
  v_email text;
  v_registration_method text;
  v_count integer := 0;
  v_rule record;
  v_run_at timestamptz;
begin
  select reg.webinar_id, session.starts_at, webinar.duration_minutes, webinar.type,
         webinar.stream_provider, webinar.broadcast_started_at, webinar.broadcast_ended_at,
         reg.email, reg.registration_method
  into v_webinar_id, v_starts_at, v_duration, v_type, v_provider, v_started, v_ended,
       v_email, v_registration_method
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  left join public.webinars webinar on webinar.id = reg.webinar_id
  where reg.id = p_registration_id;
  if v_webinar_id is null then return 0; end if;
  if v_starts_at is null and not public.reminder_uses_broadcast_clock(v_type, v_provider) then
    return 0;
  end if;
  for v_rule in
    select rule.id, rule.minutes_before, rule.timing
    from public.reminder_rules rule
    where rule.webinar_id = v_webinar_id and rule.is_enabled
      and (
        (v_registration_method = 'email' and (rule.channel <> 'email' or v_email is not null))
        or (v_registration_method = 'telegram' and rule.channel = 'telegram' and exists (
          select 1 from public.registration_message_channels channel
          where channel.registration_id = p_registration_id
            and channel.integration_connection_id = rule.integration_connection_id
            and channel.provider = 'telegram' and channel.status = 'linked'
        ))
      )
  loop
    v_run_at := public.reminder_schedule_at(
      v_type, v_provider, v_rule.timing, v_rule.minutes_before,
      v_starts_at, v_duration, v_started, v_ended
    );
    if v_run_at is not null and v_run_at >= now() then
      insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
      values (p_registration_id, v_rule.id, v_run_at)
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
alter function public.enqueue_reminders_for_registration(uuid) owner to postgres;

create or replace function public.sync_reminder_rule_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue
    where rule_id = old.id and status = 'queued'::public.reminder_status;
    return old;
  end if;
  if not new.is_enabled or new.channel not in ('email', 'manychat', 'telegram') then
    delete from public.reminder_queue
    where rule_id = new.id and status = 'queued'::public.reminder_status;
    return new;
  end if;
  delete from public.reminder_queue q
  using public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  join public.webinars w on w.id = r.webinar_id
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and public.reminder_schedule_at(
      w.type, w.stream_provider, new.timing, new.minutes_before,
      s.starts_at, w.duration_minutes, w.broadcast_started_at, w.broadcast_ended_at
    ) is null;
  update public.reminder_queue q
  set scheduled_at = public.reminder_schedule_at(
        w.type, w.stream_provider, new.timing, new.minutes_before,
        s.starts_at, w.duration_minutes, w.broadcast_started_at, w.broadcast_ended_at
      ),
      updated_at = now()
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  join public.webinars w on w.id = r.webinar_id
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and public.reminder_schedule_at(
      w.type, w.stream_provider, new.timing, new.minutes_before,
      s.starts_at, w.duration_minutes, w.broadcast_started_at, w.broadcast_ended_at
    ) is not null
    and (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    );
  delete from public.reminder_queue q
  using public.registrations r
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and not (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    );
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, public.reminder_schedule_at(
    w.type, w.stream_provider, new.timing, new.minutes_before,
    s.starts_at, w.duration_minutes, w.broadcast_started_at, w.broadcast_ended_at
  )
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  join public.webinars w on w.id = r.webinar_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and s.starts_at is not null
    and public.reminder_schedule_at(
      w.type, w.stream_provider, new.timing, new.minutes_before,
      s.starts_at, w.duration_minutes, w.broadcast_started_at, w.broadcast_ended_at
    ) >= now()
    and (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    )
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  return new;
end;
$$;
alter function public.sync_reminder_rule_queue() owner to postgres;

create or replace function public.enqueue_broadcast_wave(
  p_webinar_id uuid,
  p_timing text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select reg.id, rule.id, public.reminder_schedule_at(
    webinar.type, webinar.stream_provider, rule.timing, rule.minutes_before,
    session.starts_at, webinar.duration_minutes,
    webinar.broadcast_started_at, webinar.broadcast_ended_at
  )
  from public.registrations reg
  join public.webinars webinar on webinar.id = reg.webinar_id
  left join public.webinar_sessions session on session.id = reg.session_id
  join public.reminder_rules rule
    on rule.webinar_id = webinar.id
   and rule.is_enabled
   and rule.timing = p_timing
  where reg.webinar_id = p_webinar_id
    and reg.cancelled_at is null
    and public.reminder_schedule_at(
      webinar.type, webinar.stream_provider, rule.timing, rule.minutes_before,
      session.starts_at, webinar.duration_minutes,
      webinar.broadcast_started_at, webinar.broadcast_ended_at
    ) >= now()
    and (
      (reg.registration_method = 'email' and (rule.channel <> 'email' or reg.email is not null))
      or (reg.registration_method = 'telegram' and rule.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels channel
        where channel.registration_id = reg.id
          and channel.integration_connection_id = rule.integration_connection_id
          and channel.provider = 'telegram' and channel.status = 'linked'
      ))
    )
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
alter function public.enqueue_broadcast_wave(uuid, text) owner to postgres;
revoke all on function public.enqueue_broadcast_wave(uuid, text) from public;

create or replace function public.queue_broadcast_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.reminder_uses_broadcast_clock(new.type, new.stream_provider) then
    return new;
  end if;
  if new.broadcast_started_at is not null
     and old.broadcast_started_at is distinct from new.broadcast_started_at then
    perform public.enqueue_broadcast_wave(new.id, 'after_start');
  end if;
  if new.broadcast_ended_at is not null
     and old.broadcast_ended_at is distinct from new.broadcast_ended_at then
    perform public.enqueue_broadcast_wave(new.id, 'after_end');
  end if;
  return new;
end;
$$;
alter function public.queue_broadcast_reminders() owner to postgres;

drop trigger if exists webinars_queue_broadcast_reminders on public.webinars;
create trigger webinars_queue_broadcast_reminders
after update of broadcast_started_at, broadcast_ended_at
on public.webinars
for each row execute function public.queue_broadcast_reminders();

create or replace function public.mark_broadcast_started(p_webinar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.webinar_live_sessions
  set status = 'live',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where webinar_id = p_webinar_id
    and status in ('pending', 'live')
    and started_at is null;

  update public.webinars
  set broadcast_started_at = now(),
      updated_at = now()
  where id = p_webinar_id
    and broadcast_started_at is null
    and type = 'live'
    and stream_provider = 'cloudflare';
end;
$$;
alter function public.mark_broadcast_started(uuid) owner to postgres;
revoke all on function public.mark_broadcast_started(uuid) from public;
grant execute on function public.mark_broadcast_started(uuid) to service_role;

create or replace function public.mark_broadcast_ended(p_webinar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.webinars
  set broadcast_ended_at = now(),
      updated_at = now()
  where id = p_webinar_id
    and broadcast_ended_at is null
    and type = 'live'
    and stream_provider = 'cloudflare';
end;
$$;
alter function public.mark_broadcast_ended(uuid) owner to postgres;
revoke all on function public.mark_broadcast_ended(uuid) from public;
grant execute on function public.mark_broadcast_ended(uuid) to service_role;

-- Drop follow-ups that were queued from the planned clock. They are created
-- again when the host actually starts and stops the broadcast.
delete from public.reminder_queue queue
using public.reminder_rules rule, public.webinars webinar
where queue.rule_id = rule.id
  and rule.webinar_id = webinar.id
  and queue.status = 'queued'
  and rule.timing in ('after_start', 'after_end')
  and public.reminder_uses_broadcast_clock(webinar.type, webinar.stream_provider);
