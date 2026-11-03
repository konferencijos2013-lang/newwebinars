-- Audience language for reminder copy. The host interface language stays separate.

alter table public.webinars
  add column if not exists language text not null default 'lt';

alter table public.webinars drop constraint if exists webinars_language_check;
alter table public.webinars
  add constraint webinars_language_check
  check (language in ('lt', 'en', 'ru'));

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
  v_language text;
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

  select webinar.type, webinar.language
    into v_type, v_language
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
    'language', coalesce(v_language, 'lt'),
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
