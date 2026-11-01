-- Standard reminders: five minutes after the start, and separate follow-ups
-- for people who attended and people who missed the session.

alter table public.reminder_rules drop constraint if exists reminder_rules_timing_check;
alter table public.reminder_rules
  add constraint reminder_rules_timing_check
  check (timing in ('before_start', 'after_start', 'after_end'));

alter table public.reminder_rules
  add column if not exists audience text not null default 'all';
alter table public.reminder_rules drop constraint if exists reminder_rules_audience_check;
alter table public.reminder_rules
  add constraint reminder_rules_audience_check
  check (audience in ('all', 'attended', 'missed'));

create or replace function public.reminder_run_at(
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_timing text,
  p_offset_minutes integer
) returns timestamptz
language sql
immutable
as $$
  select case
    when p_timing = 'after_start' then
      p_starts_at + make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
    when p_timing = 'after_end' then
      p_starts_at
        + make_interval(mins => greatest(coalesce(p_duration_minutes, 0), 0))
        + make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
    else
      p_starts_at - make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
  end;
$$;
revoke all on function public.reminder_run_at(timestamptz, integer, text, integer) from public;

create or replace function public.reminder_followup_context(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_joined timestamptz;
  v_webinar_id uuid;
  v_starts_at timestamptz;
  v_type text;
  v_offer text;
  v_next timestamptz;
  v_schedule_type text;
  v_rule text;
  v_timezone text;
begin
  select reg.joined_webinar_at, reg.webinar_id, session.starts_at
    into v_joined, v_webinar_id, v_starts_at
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  where reg.id = p_registration_id;
  if v_webinar_id is null then
    return '{}'::jsonb;
  end if;

  select webinar.type into v_type
  from public.webinars webinar
  where webinar.id = v_webinar_id;

  select offer.target_url into v_offer
  from public.webinar_offers offer
  where offer.webinar_id = v_webinar_id
    and offer.active
    and offer.target_url is not null
  order by offer.updated_at desc
  limit 1;

  select session.starts_at into v_next
  from public.webinar_sessions session
  where session.webinar_id = v_webinar_id
    and session.starts_at is not null
    and session.starts_at > coalesce(v_starts_at, now())
  order by session.starts_at
  limit 1;

  select schedule.schedule_type::text, schedule.recurrence_rule, schedule.timezone
    into v_schedule_type, v_rule, v_timezone
  from public.webinar_schedules schedule
  where schedule.webinar_id = v_webinar_id
    and schedule.is_active
  order by schedule.created_at
  limit 1;

  return jsonb_build_object(
    'attended', v_joined is not null,
    'offer_link', v_offer,
    'webinar_type', v_type,
    'schedule_type', v_schedule_type,
    'recurrence_rule', v_rule,
    'timezone', coalesce(v_timezone, 'Europe/Vilnius'),
    'session_starts_at', v_starts_at,
    'next_fixed_start', v_next
  );
end;
$$;
revoke all on function public.reminder_followup_context(uuid) from public;
grant execute on function public.reminder_followup_context(uuid) to service_role;
