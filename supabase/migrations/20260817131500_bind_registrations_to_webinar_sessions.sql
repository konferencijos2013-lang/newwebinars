-- Bind every registration to an explicit webinar occurrence. This makes a
-- recurring evergreen rule useful to the public registration, waiting room,
-- reminder, capacity and reporting flows—not merely an admin display setting.

alter table public.registrations
  add column if not exists session_id uuid references public.webinar_sessions(id) on delete set null;

create index if not exists idx_registrations_session_id_active
  on public.registrations(session_id)
  where cancelled_at is null;

-- Existing registrations retain their webinar-level association until the
-- webinar is edited. New registrations always receive a resolved occurrence.

create or replace function public.resolve_webinar_session(p_webinar_id uuid)
returns public.webinar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.webinar_sessions;
  v_webinar public.webinars;
  v_schedule public.webinar_schedules;
  v_duration interval;
  v_start timestamptz;
  v_local_now timestamp;
  v_local_start timestamp;
  v_date date;
  v_days integer[];
  v_time time;
begin
  select * into v_webinar from public.webinars where id = p_webinar_id;
  if not found or v_webinar.status not in ('published', 'live') then
    raise exception 'Webinar is not open for registration';
  end if;

  -- An explicit upcoming/live session takes priority. Fixed schedules create
  -- one such session when saved, and this also supports operator-created ones.
  select * into result
  from public.webinar_sessions
  where webinar_id = p_webinar_id
    and status in ('upcoming', 'live')
    and (starts_at is null or starts_at >= now() - interval '1 hour')
  order by is_default desc, starts_at nulls first
  limit 1;
  if found then return result; end if;

  select * into v_schedule
  from public.webinar_schedules
  where webinar_id = p_webinar_id
    and is_active
    and schedule_type in ('recurring', 'just_in_time', 'on_demand')
  order by created_at
  limit 1;

  if not found then
    if v_webinar.scheduled_at is null then
      raise exception 'No available webinar session';
    end if;
    insert into public.webinar_sessions (webinar_id, title, starts_at, ends_at, is_default)
    values (p_webinar_id, null, v_webinar.scheduled_at,
      v_webinar.scheduled_at + make_interval(mins => coalesce(v_webinar.duration_minutes, 60)), true)
    returning * into result;
    return result;
  end if;

  v_duration := coalesce(v_schedule.ends_at - v_schedule.starts_at,
    make_interval(mins => coalesce(v_webinar.duration_minutes, 60)));

  if v_schedule.schedule_type = 'on_demand' or v_schedule.schedule_type = 'just_in_time' then
    v_start := now();
  else
    -- recurrence_rule is a small JSON contract maintained by the UI:
    -- {"daysOfWeek":[1,3,5],"time":"18:00"}; 1 = Monday.
    v_days := coalesce(array(select jsonb_array_elements_text(coalesce(v_schedule.recurrence_rule::jsonb -> 'daysOfWeek', '[1,2,3,4,5,6,7]'::jsonb))::integer), array[1,2,3,4,5,6,7]);
    v_time := coalesce((v_schedule.recurrence_rule::jsonb ->> 'time')::time, coalesce(v_schedule.starts_at at time zone v_schedule.timezone, time '09:00'));
    v_local_now := now() at time zone v_schedule.timezone;
    v_date := v_local_now::date;
    for i in 0..7 loop
      if extract(isodow from v_date)::integer = any(v_days)
        and (i > 0 or v_local_now::time <= v_time) then
        exit;
      end if;
      v_date := v_date + 1;
    end loop;
    v_local_start := v_date + v_time;
    v_start := v_local_start at time zone v_schedule.timezone;
  end if;

  insert into public.webinar_sessions (webinar_id, title, starts_at, ends_at, is_default)
  values (p_webinar_id, null, v_start, v_start + v_duration, true)
  returning * into result;
  return result;
end;
$$;

alter function public.resolve_webinar_session(uuid) owner to postgres;
grant execute on function public.resolve_webinar_session(uuid) to anon, authenticated;

create or replace function public.is_webinar_open_for_registration(p_webinar_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_webinar_max integer;
  v_plan_max integer;
  v_session_max integer;
  v_effective_max integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select status, max_participants into v_status, v_webinar_max from public.webinars where id = p_webinar_id;
  select capacity into v_session_max from public.webinar_sessions where id = p_session_id and webinar_id = p_webinar_id;
  if v_status not in ('published', 'live') or not found then return false; end if;
  select nullif(limits ->> 'max_participants_per_webinar', '')::integer into v_plan_max
  from public.current_credit_plan_for_account((select account_id from public.webinars where id = p_webinar_id));
  v_effective_max := least(coalesce(v_webinar_max, 2147483647), coalesce(v_plan_max, 2147483647), coalesce(v_session_max, 2147483647));
  select count(*) into v_count from public.registrations where session_id = p_session_id and cancelled_at is null;
  return v_count < v_effective_max;
end;
$$;

create or replace function public.register_for_webinar(
  p_webinar_id uuid, p_email text, p_full_name text default null, p_phone text default null,
  p_company text default null, p_referrer_url text default null, p_referral_code text default null
) returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare
  result public.registrations;
  v_account_id uuid;
  v_session public.webinar_sessions;
begin
  v_session := public.resolve_webinar_session(p_webinar_id);
  if not public.is_webinar_open_for_registration(p_webinar_id, v_session.id) then
    raise exception 'Webinar session is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then raise exception 'Invalid referral code'; end if;
  if exists (select 1 from public.registrations where session_id = v_session.id and lower(email) = lower(trim(p_email)) and cancelled_at is null) then
    raise exception 'You are already registered for this webinar session';
  end if;
  select account_id into v_account_id from public.webinars where id = p_webinar_id;
  perform public.consume_account_credit(v_account_id, 'registration', 1, 'webinar', p_webinar_id, jsonb_build_object('email', lower(trim(p_email)), 'session_id', v_session.id));
  insert into public.registrations (webinar_id, session_id, email, full_name, phone, company, referrer_url, referral_code, status)
  values (p_webinar_id, v_session.id, lower(trim(p_email)), p_full_name, p_phone, p_company, p_referrer_url, p_referral_code, 'registered')
  returning * into result;
  perform public.enqueue_reminders_for_registration(result.id);
  return result;
end;
$$;

alter function public.register_for_webinar(uuid, text, text, text, text, text, text) owner to postgres;
grant execute on function public.register_for_webinar(uuid, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.enqueue_reminders_for_registration(p_registration_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_webinar_id uuid; v_starts_at timestamptz; v_count integer := 0; r record;
begin
  select r.webinar_id, s.starts_at into v_webinar_id, v_starts_at
  from public.registrations r left join public.webinar_sessions s on s.id = r.session_id
  where r.id = p_registration_id;
  if v_webinar_id is null or v_starts_at is null then return 0; end if;
  for r in select id, minutes_before from public.reminder_rules where webinar_id = v_webinar_id and is_enabled loop
    if v_starts_at - make_interval(mins => r.minutes_before) >= now() then
      insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
      values (p_registration_id, r.id, v_starts_at - make_interval(mins => r.minutes_before))
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
alter function public.enqueue_reminders_for_registration(uuid) owner to postgres;

-- Correct the reminder-rule rescheduling trigger for session-bound reminders.
create or replace function public.sync_reminder_rule_queue()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue where rule_id = old.id and status = 'queued'::public.reminder_status; return old;
  end if;
  if not new.is_enabled or new.channel not in ('email', 'manychat') then
    delete from public.reminder_queue where rule_id = new.id and status = 'queued'::public.reminder_status; return new;
  end if;
  update public.reminder_queue q set scheduled_at = s.starts_at - make_interval(mins => new.minutes_before), updated_at = now()
  from public.registrations r join public.webinar_sessions s on s.id = r.session_id
  where q.rule_id = new.id and q.registration_id = r.id and q.status = 'queued'::public.reminder_status;
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, s.starts_at - make_interval(mins => new.minutes_before)
  from public.registrations r join public.webinar_sessions s on s.id = r.session_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and s.starts_at is not null
    and s.starts_at - make_interval(mins => new.minutes_before) >= now()
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  return new;
end;
$$;
