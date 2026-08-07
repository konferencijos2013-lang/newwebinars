-- Enforce the plan limits at the database boundary so browser clients cannot bypass them.
-- Free-plan credits are also initialized whenever a new account is created.

create or replace function public.current_credit_plan_for_account(p_account_id uuid)
returns public.credit_plans
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.credit_plans p
  left join lateral (
    select s.credit_plan_id
    from public.subscriptions s
    where s.account_id = p_account_id
      and s.status in ('active', 'trialing')
    order by s.created_at desc
    limit 1
  ) subscription on true
  where p.id = coalesce(
    subscription.credit_plan_id,
    (select default_plan.id from public.credit_plans default_plan
     where default_plan.is_active = true and default_plan.is_default = true
     limit 1)
  )
  limit 1;
$$;

revoke all on function public.current_credit_plan_for_account(uuid) from public;

create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.credit_plans;
  v_credit record;
begin
  insert into public.account_members (account_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  select * into v_plan from public.current_credit_plan_for_account(new.id);
  if v_plan.id is not null then
    for v_credit in select key, value from jsonb_each_text(v_plan.monthly_credits)
    loop
      insert into public.account_credits (
        account_id, credit_type, balance, rollover_balance, period_started_at, period_ends_at
      ) values (
        new.id, v_credit.key::public.credit_type, greatest(v_credit.value::integer, 0), 0,
        now(), now() + interval '1 month'
      ) on conflict (account_id, credit_type) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_webinar_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.credit_plans;
  v_max_webinars integer;
  v_existing integer;
  v_lock_key bigint;
begin
  v_lock_key := hashtextextended(new.account_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_plan from public.current_credit_plan_for_account(new.account_id);
  v_max_webinars := nullif(v_plan.limits ->> 'max_webinars', '')::integer;
  if v_max_webinars is null then
    return new;
  end if;

  select count(*) into v_existing
  from public.webinars
  where account_id = new.account_id;

  if v_existing >= v_max_webinars then
    raise exception 'PLAN_WEBINAR_LIMIT_EXCEEDED: Your % plan allows up to % webinar(s).', v_plan.name, v_max_webinars
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_webinar_plan_limit on public.webinars;
create trigger trg_enforce_webinar_plan_limit
before insert on public.webinars
for each row execute function public.enforce_webinar_plan_limit();

create or replace function public.enforce_team_member_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.credit_plans;
  v_max_members integer;
  v_existing integer;
  v_lock_key bigint;
begin
  v_lock_key := hashtextextended(new.account_id::text, 1);
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_plan from public.current_credit_plan_for_account(new.account_id);
  v_max_members := nullif(v_plan.limits ->> 'max_team_members', '')::integer;
  if v_max_members is null then
    return new;
  end if;

  select count(*) into v_existing
  from public.account_members
  where account_id = new.account_id;

  if v_existing >= v_max_members then
    raise exception 'PLAN_TEAM_MEMBER_LIMIT_EXCEEDED: Your % plan allows up to % team member(s).', v_plan.name, v_max_members
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_team_member_plan_limit on public.account_members;
create trigger trg_enforce_team_member_plan_limit
before insert on public.account_members
for each row execute function public.enforce_team_member_plan_limit();

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
  v_lock_key bigint;
begin
  v_lock_key := hashtextextended(webinar_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select w.account_id, w.status, w.max_participants
  into v_account_id, v_status, v_webinar_max
  from public.webinars w
  where w.id = webinar_id;

  if v_status not in ('published', 'live') then
    return false;
  end if;

  select nullif(limits ->> 'max_participants_per_webinar', '')::integer
  into v_plan_max
  from public.current_credit_plan_for_account(v_account_id);

  v_effective_max := case
    when v_webinar_max is null then v_plan_max
    when v_plan_max is null then v_webinar_max
    else least(v_webinar_max, v_plan_max)
  end;

  select count(*) into v_count
  from public.registrations r
  where r.webinar_id = webinar_id and r.cancelled_at is null;

  return v_effective_max is null or v_count < v_effective_max;
end;
$$;

create or replace function public.register_for_webinar(
  p_webinar_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null,
  p_company text default null,
  p_referrer_url text default null,
  p_referral_code text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
  v_account_id uuid;
begin
  if not public.is_webinar_open_for_registration(p_webinar_id) then
    raise exception 'Webinar is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then
    raise exception 'Invalid referral code';
  end if;

  if exists (
    select 1
    from public.registrations
    where webinar_id = p_webinar_id
      and email = p_email
      and cancelled_at is null
  ) then
    raise exception 'You are already registered for this webinar';
  end if;

  select account_id into v_account_id from public.webinars where id = p_webinar_id;
  perform public.consume_account_credit(
    v_account_id, 'registration', 1, 'webinar', p_webinar_id,
    jsonb_build_object('email', lower(trim(p_email)))
  );

  insert into public.registrations (
    webinar_id, email, full_name, phone, company, referrer_url, referral_code, status
  ) values (
    p_webinar_id, p_email, p_full_name, p_phone, p_company, p_referrer_url, p_referral_code, 'registered'
  ) returning * into result;

  perform public.enqueue_reminders_for_registration(result.id);
  return result;
end;
$$;

alter function public.register_for_webinar(uuid, text, text, text, text, text, text) owner to postgres;
grant execute on function public.register_for_webinar(uuid, text, text, text, text, text, text) to anon, authenticated;
