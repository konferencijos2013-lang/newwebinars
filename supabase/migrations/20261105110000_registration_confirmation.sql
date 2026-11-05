-- The first message in the sequence goes out as soon as someone registers.
-- Older registrations are not mailed a late "you just registered" note.

alter table public.reminder_rules drop constraint if exists reminder_rules_timing_check;
alter table public.reminder_rules
  add constraint reminder_rules_timing_check
  check (timing in ('on_registration', 'before_start', 'after_start', 'after_end'));

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
    if v_rule.timing = 'on_registration' then
      v_run_at := now();
    elsif v_starts_at is null and not public.reminder_uses_broadcast_clock(v_type, v_provider) then
      continue;
    else
      v_run_at := public.reminder_schedule_at(
        v_type, v_provider, v_rule.timing, v_rule.minutes_before,
        v_starts_at, v_duration, v_started, v_ended
      );
    end if;
    if v_run_at is not null and (v_rule.timing = 'on_registration' or v_run_at >= now()) then
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
    and new.timing <> 'on_registration'
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
    and new.timing <> 'on_registration'
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
    and new.timing <> 'on_registration'
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
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, now()
  from public.registrations r
  where new.timing = 'on_registration'
    and r.webinar_id = new.webinar_id
    and r.cancelled_at is null
    and r.registered_at >= now() - interval '15 minutes'
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
