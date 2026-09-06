-- Give explicitly assigned first-party accounts an internal unlimited plan.
-- Entitlement is account-scoped: platform administrator status alone never bypasses limits.

create table if not exists public.internal_account_plan_assignments (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  credit_plan_id uuid not null references public.credit_plans(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.internal_account_plan_assignments is
  'Server-managed first-party account entitlements. Never infer assignments from platform administrator access.';

alter table public.internal_account_plan_assignments enable row level security;
revoke all on public.internal_account_plan_assignments from public, anon, authenticated;
grant all on public.internal_account_plan_assignments to service_role;

insert into public.credit_plans (
  code, name, stripe_price_id, is_active, is_default, monthly_credits, limits,
  price_cents, currency, interval
)
values (
  'internal-unlimited', 'Internal / Unlimited', null, false, false, '{}'::jsonb,
  '{}'::jsonb, 0, 'eur', 'month'
)
on conflict (code) do update set
  name = excluded.name,
  stripe_price_id = null,
  is_active = false,
  is_default = false,
  monthly_credits = excluded.monthly_credits,
  limits = excluded.limits,
  price_cents = 0,
  currency = excluded.currency,
  interval = excluded.interval,
  updated_at = now();

create or replace function public.current_credit_plan_for_account(p_account_id uuid)
returns public.credit_plans
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.credit_plans p
  where p.id = coalesce(
    (
      select assignment.credit_plan_id
      from public.internal_account_plan_assignments assignment
      where assignment.account_id = p_account_id
      limit 1
    ),
    (
      select subscription.credit_plan_id
      from public.subscriptions subscription
      where subscription.account_id = p_account_id
        and subscription.is_current
        and subscription.access_granted_at is not null
        and subscription.status in ('active', 'trialing', 'past_due', 'paused')
      order by subscription.created_at desc
      limit 1
    ),
    (
      select default_plan.id
      from public.credit_plans default_plan
      where default_plan.is_active and default_plan.is_default
      limit 1
    )
  )
  limit 1
$$;
revoke all on function public.current_credit_plan_for_account(uuid) from public, anon, authenticated;
grant execute on function public.current_credit_plan_for_account(uuid) to service_role;

create or replace function public.consume_account_credit(
  p_account_id uuid,
  p_credit_type public.credit_type,
  p_quantity integer,
  p_scope public.usage_event_scope default 'other',
  p_scope_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_internal boolean;
begin
  if p_quantity <= 0 then
    raise exception 'Usage quantity must be positive';
  end if;

  select exists (
    select 1
    from public.internal_account_plan_assignments assignment
    join public.credit_plans plan on plan.id = assignment.credit_plan_id
    where assignment.account_id = p_account_id
      and plan.code = 'internal-unlimited'
  ) into v_internal;

  if v_internal then
    insert into public.usage_events (
      account_id, credit_type, scope, scope_id, quantity, metadata
    ) values (
      p_account_id, p_credit_type, p_scope, p_scope_id, p_quantity,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('internal_unlimited', true)
    );
    return 2147483647;
  end if;

  update public.account_credits
  set balance = balance - p_quantity, updated_at = now()
  where account_id = p_account_id
    and credit_type = p_credit_type
    and balance >= p_quantity
  returning balance into v_balance;

  if not found then
    raise exception 'CREDIT_LIMIT_EXCEEDED';
  end if;

  insert into public.usage_events (
    account_id, credit_type, scope, scope_id, quantity, metadata
  ) values (
    p_account_id, p_credit_type, p_scope, p_scope_id, p_quantity,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_balance;
end;
$$;
revoke all on function public.consume_account_credit(
  uuid, public.credit_type, integer, public.usage_event_scope, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.consume_account_credit(
  uuid, public.credit_type, integer, public.usage_event_scope, uuid, jsonb
) to service_role;

-- This is the sole account-specific assignment. It is deliberately tied to the
-- known internal workspace identity, not to every workspace an administrator can access.
do $$
declare
  v_account_id uuid;
  v_owner_id uuid;
  v_plan_id uuid;
begin
  select account.id, account.owner_id
  into strict v_account_id, v_owner_id
  from public.accounts account
  join public.profiles owner on owner.id = account.owner_id
  where lower(owner.email) = lower('konferencijos2013@gmail.com')
    and owner.role = 'admin'
    and account.name = 'Virginijus Guoga''s workspace';

  select id into strict v_plan_id
  from public.credit_plans
  where code = 'internal-unlimited';

  insert into public.internal_account_plan_assignments (
    account_id, credit_plan_id, assigned_by, reason
  ) values (
    v_account_id, v_plan_id, v_owner_id,
    'Primary platform-operated internal workspace'
  )
  on conflict (account_id) do update set
    credit_plan_id = excluded.credit_plan_id,
    assigned_by = excluded.assigned_by,
    reason = excluded.reason,
    updated_at = now();
exception
  when no_data_found then
    raise exception 'Expected internal workspace was not found; no unlimited plan was assigned';
  when too_many_rows then
    raise exception 'Internal workspace identity is ambiguous; no unlimited plan was assigned';
end
$$;
