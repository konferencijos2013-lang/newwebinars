-- Make Stripe delivery idempotent and centralize account credit accounting.

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

comment on table public.stripe_webhook_events is 'Idempotency ledger for verified Stripe webhook events.';

alter table public.stripe_webhook_events enable row level security;

create unique index payments_stripe_invoice_id_unique
  on public.payments (stripe_invoice_id)
  where stripe_invoice_id is not null;

-- Existing plans receive explicit AI-token allowances. Admin UI will make these values editable.
update public.credit_plans
set monthly_credits = monthly_credits || jsonb_build_object(
  'ai_token',
  case name
    when 'Free' then 50000
    when 'Growth' then 500000
    when 'Scale' then 2500000
    else coalesce((monthly_credits ->> 'ai_token')::integer, 0)
  end
)
where not monthly_credits ? 'ai_token';

-- Give accounts without a paid subscription the default plan allocation immediately.
insert into public.account_credits (account_id, credit_type, balance, rollover_balance, period_started_at, period_ends_at)
select
  a.id, credits.key::public.credit_type, greatest(credits.value::integer, 0), 0, now(), now() + interval '1 month'
from public.accounts a
join public.credit_plans p on p.is_default = true and p.is_active = true
cross join lateral jsonb_each_text(p.monthly_credits) as credits(key, value)
on conflict (account_id, credit_type) do nothing;

create or replace function public.reset_account_credits_for_plan(
  p_account_id uuid,
  p_plan_id uuid,
  p_period_started_at timestamptz,
  p_period_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits jsonb;
  v_item record;
begin
  select monthly_credits into v_credits from public.credit_plans where id = p_plan_id;
  if v_credits is null then
    raise exception 'Credit plan % not found', p_plan_id;
  end if;

  for v_item in select key, value from jsonb_each_text(v_credits)
  loop
    insert into public.account_credits (
      account_id, credit_type, balance, rollover_balance, period_started_at, period_ends_at
    ) values (
      p_account_id, v_item.key::public.credit_type, greatest(v_item.value::integer, 0), 0,
      p_period_started_at, p_period_ends_at
    )
    on conflict (account_id, credit_type) do update set
      balance = excluded.balance,
      rollover_balance = 0,
      period_started_at = excluded.period_started_at,
      period_ends_at = excluded.period_ends_at,
      updated_at = now();
  end loop;
end;
$$;

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
begin
  if p_quantity <= 0 then
    raise exception 'Usage quantity must be positive';
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

  insert into public.usage_events (account_id, credit_type, scope, scope_id, quantity, metadata)
  values (p_account_id, p_credit_type, p_scope, p_scope_id, p_quantity, coalesce(p_metadata, '{}'::jsonb));

  return v_balance;
end;
$$;

revoke all on function public.reset_account_credits_for_plan(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.consume_account_credit(uuid, public.credit_type, integer, public.usage_event_scope, uuid, jsonb) from public;
