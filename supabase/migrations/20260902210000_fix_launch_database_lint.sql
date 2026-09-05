-- Resolve launch-blocking PL/pgSQL lint errors without changing public APIs.

create or replace function public.generate_partner_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  for v_attempt in 1..20 loop
    v_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    if not exists (
      select 1 from public.partners p where p.code = v_code
    ) then
      return v_code;
    end if;
  end loop;

  raise exception 'Could not generate a unique partner code';
end;
$$;

create or replace function public.is_webinar_open_for_registration(webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_status text;
  v_webinar_max integer;
  v_plan_max integer;
  v_effective_max integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended($1::text, 0));

  select w.account_id, w.status, w.max_participants
  into v_account_id, v_status, v_webinar_max
  from public.webinars w
  where w.id = $1;

  if not found or v_status not in ('published', 'live') then
    return false;
  end if;

  select nullif(cp.limits ->> 'max_participants_per_webinar', '')::integer
  into v_plan_max
  from public.current_credit_plan_for_account(v_account_id) cp;

  v_effective_max := case
    when v_webinar_max is null then v_plan_max
    when v_plan_max is null then v_webinar_max
    else least(v_webinar_max, v_plan_max)
  end;

  select count(*)
  into v_count
  from public.registrations r
  where r.webinar_id = $1
    and r.cancelled_at is null;

  return v_effective_max is null or v_count < v_effective_max;
end;
$$;

create or replace function public.enqueue_reminders_for_registration(p_registration_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webinar_id uuid;
  v_starts_at timestamptz;
  v_count integer := 0;
  v_rule record;
begin
  select reg.webinar_id, session.starts_at
  into v_webinar_id, v_starts_at
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  where reg.id = p_registration_id;

  if v_webinar_id is null or v_starts_at is null then
    return 0;
  end if;

  for v_rule in
    select rule.id, rule.minutes_before
    from public.reminder_rules rule
    where rule.webinar_id = v_webinar_id
      and rule.is_enabled
  loop
    if v_starts_at - make_interval(mins => v_rule.minutes_before) >= now() then
      insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
      values (
        p_registration_id,
        v_rule.id,
        v_starts_at - make_interval(mins => v_rule.minutes_before)
      )
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.get_manychat_link_options(p_access_token uuid)
returns table (
  integration_connection_id uuid,
  status text,
  connect_url text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
  v_token text;
  v_expires timestamptz := now() + interval '30 minutes';
  v_channel record;
begin
  select reg.id
  into v_registration_id
  from public.registrations reg
  where reg.access_token = p_access_token
    and reg.cancelled_at is null;

  if v_registration_id is null then return; end if;

  perform public.prepare_manychat_channels_for_registration(v_registration_id);
  for v_channel in
    select mc.integration_connection_id, mc.status,
      coalesce(ic.config ->> 'link_url_template', '') as link_url_template
    from public.registration_message_channels mc
    join public.integration_connections ic on ic.id = mc.integration_connection_id
    where mc.registration_id = v_registration_id
      and mc.provider = 'manychat'
      and ic.status = 'active'
  loop
    if v_channel.status = 'linked' then
      integration_connection_id := v_channel.integration_connection_id;
      status := 'linked';
      connect_url := null;
      expires_at := null;
      return next;
      continue;
    end if;
    if v_channel.link_url_template = ''
      or position('{{manychat_link_token}}' in v_channel.link_url_template) = 0
    then
      continue;
    end if;

    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.registration_message_channels
    set link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
        link_expires_at = v_expires,
        status = 'pending',
        last_error = null,
        updated_at = now()
    where registration_id = v_registration_id
      and integration_connection_id = v_channel.integration_connection_id
      and provider = 'manychat';

    integration_connection_id := v_channel.integration_connection_id;
    status := 'pending';
    connect_url := replace(v_channel.link_url_template, '{{manychat_link_token}}', v_token);
    expires_at := v_expires;
    return next;
  end loop;
end;
$$;

create or replace function public.link_manychat_subscriber(
  p_connection_id uuid,
  p_link_token text,
  p_subscriber_id text,
  p_channel text default 'other'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.registration_message_channels;
begin
  if length(trim(coalesce(p_link_token, ''))) < 32
    or length(trim(coalesce(p_subscriber_id, ''))) = 0
  then
    raise exception 'Invalid linking payload';
  end if;

  select channel.*
  into v_state
  from public.registration_message_channels channel
  where channel.integration_connection_id = p_connection_id
    and channel.provider = 'manychat'
    and channel.link_token_hash = encode(extensions.digest(p_link_token, 'sha256'), 'hex')
    and channel.link_expires_at > now()
  for update;

  if v_state.id is null then return 'invalid_or_expired'; end if;
  if v_state.status = 'linked' then return 'already_linked'; end if;

  update public.registration_message_channels
  set external_subscriber_id = trim(p_subscriber_id),
      external_channel = case
        when p_channel in ('messenger', 'instagram', 'whatsapp', 'telegram') then p_channel
        else 'other'
      end,
      status = 'linked',
      linked_at = now(),
      link_token_hash = null,
      link_expires_at = null,
      last_error = null,
      updated_at = now()
  where id = v_state.id;

  return 'linked';
end;
$$;

create or replace function public.record_platform_partner_click(
  p_code text,
  p_visitor_token_hash text,
  p_landing_path text default '/',
  p_referrer_url text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns table(click_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.partners%rowtype;
  v_click_id uuid;
  v_existing_attribution_id uuid;
  v_expires_at timestamptz;
begin
  select partner.*
  into v_partner
  from public.partners partner
  where partner.code = lower(trim(p_code))
    and partner.type = 'affiliate'
    and partner.is_active = true;

  if not found then return; end if;
  if p_visitor_token_hash is null or length(p_visitor_token_hash) < 32 then
    raise exception 'Invalid visitor token';
  end if;

  insert into public.platform_partner_clicks (
    partner_id, visitor_token_hash, landing_path, referrer_url,
    utm_source, utm_medium, utm_campaign
  )
  values (
    v_partner.id,
    p_visitor_token_hash,
    left(coalesce(p_landing_path, '/'), 500),
    left(p_referrer_url, 2000),
    left(p_utm_source, 200),
    left(p_utm_medium, 200),
    left(p_utm_campaign, 200)
  )
  returning id into v_click_id;

  select attribution.id, attribution.expires_at
  into v_existing_attribution_id, v_expires_at
  from public.platform_partner_attributions attribution
  where attribution.visitor_token_hash = p_visitor_token_hash
    and attribution.account_id is null
    and attribution.status = 'active'
    and attribution.expires_at > now()
  order by attribution.attributed_at asc
  limit 1;

  if v_existing_attribution_id is null then
    v_expires_at := now() + make_interval(days => v_partner.attribution_window_days);
    insert into public.platform_partner_attributions (
      partner_id, click_id, visitor_token_hash, expires_at,
      commission_rate_bps, commission_months, payout_hold_days
    )
    values (
      v_partner.id, v_click_id, p_visitor_token_hash, v_expires_at,
      v_partner.commission_rate_bps, v_partner.commission_months,
      v_partner.payout_hold_days
    );
  end if;

  return query select v_click_id, v_expires_at;
end;
$$;

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
  select webinar.* into v_webinar
  from public.webinars webinar
  where webinar.id = p_webinar_id;
  if not found or v_webinar.status not in ('published', 'live') then
    raise exception 'Webinar is not open for registration';
  end if;

  select session.* into result
  from public.webinar_sessions session
  where session.webinar_id = p_webinar_id
    and session.status in ('upcoming', 'live')
    and (session.starts_at is null or session.starts_at >= now() - interval '1 hour')
  order by session.is_default desc, session.starts_at nulls first
  limit 1;
  if found then return result; end if;

  select schedule.* into v_schedule
  from public.webinar_schedules schedule
  where schedule.webinar_id = p_webinar_id
    and schedule.is_active
    and schedule.schedule_type in ('recurring', 'just_in_time', 'on_demand')
  order by schedule.created_at
  limit 1;

  if not found then
    if v_webinar.scheduled_at is null then
      raise exception 'No available webinar session';
    end if;
    insert into public.webinar_sessions (webinar_id, title, starts_at, ends_at, is_default)
    values (
      p_webinar_id,
      null,
      v_webinar.scheduled_at,
      v_webinar.scheduled_at + make_interval(mins => coalesce(v_webinar.duration_minutes, 60)),
      true
    )
    returning * into result;
    return result;
  end if;

  v_duration := coalesce(
    v_schedule.ends_at - v_schedule.starts_at,
    make_interval(mins => coalesce(v_webinar.duration_minutes, 60))
  );

  if v_schedule.schedule_type in ('on_demand', 'just_in_time') then
    v_start := now();
  else
    v_days := coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(
            v_schedule.recurrence_rule::jsonb -> 'daysOfWeek',
            '[1,2,3,4,5,6,7]'::jsonb
          )
        )::integer
      ),
      array[1,2,3,4,5,6,7]
    );
    v_time := coalesce(
      (v_schedule.recurrence_rule::jsonb ->> 'time')::time,
      (v_schedule.starts_at at time zone v_schedule.timezone)::time,
      time '09:00'
    );
    v_local_now := now() at time zone v_schedule.timezone;
    v_date := v_local_now::date;
    for i in 0..7 loop
      if extract(isodow from v_date)::integer = any(v_days)
        and (i > 0 or v_local_now::time <= v_time)
      then
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
