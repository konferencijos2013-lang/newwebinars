-- Stripe Live hardening: stable catalog identities, complete lifecycle state,
-- durable webhook processing, and server-only billing mutations.

alter table public.credit_plans
  add column if not exists code text,
  add column if not exists currency text not null default 'eur';

-- Assign canonical identities only to the exact catalog rows accepted in
-- 20260807124300. Rows disabled below retain their canonical code on reruns; every
-- other row receives an ID-derived legacy code, so assignment is deterministic.
update public.credit_plans
set code = case
  when name = 'Free' and interval = 'month' and price_cents = 0
    and (is_active or code = 'free-month') then 'free-month'
  when name = 'Start' and interval = 'month' and price_cents = 1900
    and (is_active or code = 'start-month') then 'start-month'
  when name = 'Start' and interval = 'year' and price_cents = 18240
    and (is_active or code = 'start-year') then 'start-year'
  when name = 'Grow' and interval = 'month' and price_cents = 3900
    and (is_active or code = 'grow-month') then 'grow-month'
  when name = 'Grow' and interval = 'year' and price_cents = 37440
    and (is_active or code = 'grow-year') then 'grow-year'
  when name = 'Scale' and interval = 'month' and price_cents = 7900
    and (is_active or code = 'scale-month') then 'scale-month'
  when name = 'Scale' and interval = 'year' and price_cents = 75840
    and (is_active or code = 'scale-year') then 'scale-year'
  else 'legacy-' || replace(id::text, '-', '')
end;

alter table public.credit_plans alter column code set not null;
create unique index if not exists credit_plans_code_unique on public.credit_plans(code);
create unique index if not exists credit_plans_stripe_price_id_unique
  on public.credit_plans(stripe_price_id) where stripe_price_id is not null;
do $$ begin
  alter table public.credit_plans
    add constraint credit_plans_code_format check (code ~ '^[a-z0-9][a-z0-9-]{1,63}$');
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.credit_plans
    add constraint credit_plans_currency_format check (currency ~ '^[a-z]{3}$');
exception when duplicate_object then null;
end $$;

-- Annual subscriptions receive the exact accepted monthly catalog allocation
-- multiplied by 12. Constants prevent reruns or edited rows from compounding/drifting.
with annual_allocations(code, name, price_cents, credits) as (values
  ('start-year', 'Start', 18240, '{"live_webinar_minute":3600,"automated_webinar_minute":3600,"registration":12000,"recording_storage_gb_month":120,"ai_token":6000000}'::jsonb),
  ('grow-year', 'Grow', 37440, '{"live_webinar_minute":14400,"automated_webinar_minute":14400,"registration":60000,"recording_storage_gb_month":600,"ai_token":30000000}'::jsonb),
  ('scale-year', 'Scale', 75840, '{"live_webinar_minute":60000,"automated_webinar_minute":60000,"registration":240000,"recording_storage_gb_month":2400,"ai_token":120000000}'::jsonb)
)
update public.credit_plans p
set monthly_credits = a.credits, updated_at = now()
from annual_allocations a
where p.code = a.code and p.name = a.name and p.interval = 'year'
  and p.price_cents = a.price_cents and p.monthly_credits is distinct from a.credits;

-- Paid plans remain unavailable until an operator binds real Stripe recurring prices.
update public.credit_plans set is_active = false, updated_at = now()
where price_cents > 0 and stripe_price_id is null and is_active;

comment on column public.credit_plans.code is
  'Stable application identifier. Configure Stripe safely with admin SQL, e.g. UPDATE credit_plans SET stripe_price_id = :price_id, is_active = true WHERE code = :code; verify amount/currency/interval in Stripe first. Never commit live price IDs.';
comment on column public.credit_plans.monthly_credits is
  'Allocation granted per successful subscription invoice; annual plan rows contain annualized (12x) allocations.';

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_latest_event_created_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists access_granted_at timestamptz,
  add column if not exists is_current boolean not null default true;

-- Only Stripe statuses that can still progress are eligible to be current.
-- Clear terminal rows first so the partial unique index cannot see stale duplicates.
update public.subscriptions set is_current = false;
with ranked as (
  select id, row_number() over (partition by account_id order by created_at desc, id desc) as rank
  from public.subscriptions
  where status in ('incomplete', 'active', 'past_due', 'paused', 'trialing')
)
update public.subscriptions s
set is_current = true
from ranked where ranked.id = s.id and ranked.rank = 1;

-- Preserve entitlements already proven by a successful historical invoice.
update public.subscriptions s
set access_granted_at = (
  select coalesce(p.paid_at, p.created_at)
  from public.payments p
  where p.subscription_id = s.id and p.status = 'succeeded'
  order by coalesce(p.paid_at, p.created_at)
  limit 1
)
where s.access_granted_at is null
  and exists (
    select 1 from public.payments p
    where p.subscription_id = s.id and p.status = 'succeeded'
  );

create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions(stripe_customer_id);
create unique index if not exists subscriptions_one_current_per_account
  on public.subscriptions(account_id) where is_current;

alter table public.payments
  add column if not exists failure_message text,
  add column if not exists invoice_status text,
  add column if not exists stripe_event_created_at timestamptz,
  add column if not exists credits_granted_at timestamptz;

alter table public.stripe_webhook_events
  add column if not exists status text not null default 'processing',
  add column if not exists attempts integer not null default 1,
  add column if not exists last_attempted_at timestamptz not null default now(),
  add column if not exists error_message text,
  add column if not exists event_created_at timestamptz,
  add column if not exists processing_token uuid;

do $$ begin
  alter table public.stripe_webhook_events
    add constraint stripe_webhook_events_status_check
    check (status in ('processing', 'processed', 'failed', 'ignored'));
exception when duplicate_object then null;
end $$;

-- Stripe/service-role writes billing state. Browser users retain tenant-scoped reads only.
revoke insert, update, delete on public.account_credits from authenticated;
revoke insert on public.usage_events from authenticated;
revoke insert, update, delete on public.billing_customers from authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.payments from authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;

grant select on public.credit_plans, public.account_credits, public.usage_events,
  public.billing_customers, public.subscriptions, public.payments to authenticated;
grant all on public.credit_plans, public.account_credits, public.usage_events,
  public.billing_customers, public.subscriptions, public.payments,
  public.stripe_webhook_events to service_role;

-- These RPCs are webhook/worker internals, not browser APIs.
revoke all on function public.create_affiliate_commission_for_payment(text) from public, anon, authenticated;
revoke all on function public.reverse_affiliate_commission_for_invoice(text) from public, anon, authenticated;
revoke all on function public.release_available_affiliate_commissions() from public, anon, authenticated;
grant execute on function public.create_affiliate_commission_for_payment(text) to service_role;
grant execute on function public.reverse_affiliate_commission_for_invoice(text) to service_role;
grant execute on function public.release_available_affiliate_commissions() to service_role;

create or replace function public.current_credit_plan_for_account(p_account_id uuid)
returns public.credit_plans language sql stable security definer set search_path = public as $$
  select p.* from public.credit_plans p
  where p.id = coalesce(
    (select s.credit_plan_id from public.subscriptions s where s.account_id = p_account_id and s.is_current
      and s.access_granted_at is not null
      and s.status in ('active', 'trialing', 'past_due', 'paused')
      order by s.created_at desc limit 1),
    (select d.id from public.credit_plans d where d.is_active and d.is_default limit 1)
  ) limit 1
$$;
revoke all on function public.current_credit_plan_for_account(uuid) from public;

-- Reset all credit types, including those absent from the destination plan, preventing stale credit.
create or replace function public.reset_account_credits_for_plan(
  p_account_id uuid, p_plan_id uuid, p_period_started_at timestamptz, p_period_ends_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_credits jsonb; v_type public.credit_type;
begin
  select monthly_credits into v_credits from public.credit_plans where id = p_plan_id;
  if v_credits is null then raise exception 'Credit plan % not found', p_plan_id; end if;
  for v_type in select unnest(enum_range(null::public.credit_type)) loop
    insert into public.account_credits(account_id, credit_type, balance, rollover_balance, period_started_at, period_ends_at)
    values (p_account_id, v_type, greatest(coalesce((v_credits ->> v_type::text)::integer, 0), 0), 0, p_period_started_at, p_period_ends_at)
    on conflict (account_id, credit_type) do update set balance=excluded.balance, rollover_balance=0,
      period_started_at=excluded.period_started_at, period_ends_at=excluded.period_ends_at, updated_at=now();
  end loop;
end $$;
revoke all on function public.reset_account_credits_for_plan(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reset_account_credits_for_plan(uuid, uuid, timestamptz, timestamptz) to service_role;


-- Claiming and state transitions are database-atomic so concurrent/reordered deliveries cannot
-- double-grant credits or overwrite newer Stripe state.
create or replace function public.claim_stripe_webhook_event(
  p_event_id text, p_event_type text, p_event_created_at timestamptz,
  p_processing_token uuid, p_payload jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_claimed boolean := false;
begin
  insert into public.stripe_webhook_events(
    stripe_event_id, event_type, status, attempts, last_attempted_at,
    event_created_at, processing_token, error_message, payload
  ) values (
    p_event_id, p_event_type, 'processing', 1, now(), p_event_created_at,
    p_processing_token, null, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (stripe_event_id) do update set
    status = 'processing', attempts = stripe_webhook_events.attempts + 1,
    last_attempted_at = now(), processing_token = excluded.processing_token,
    error_message = null, payload = excluded.payload
  where stripe_webhook_events.status = 'failed'
     or (stripe_webhook_events.status = 'processing'
         and stripe_webhook_events.last_attempted_at < now() - interval '5 minutes')
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end $$;

create or replace function public.sync_stripe_subscription(
  p_account_id uuid, p_plan_id uuid, p_subscription_id text, p_customer_id text,
  p_price_id text, p_status text, p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean, p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_terminal boolean := p_status in ('canceled', 'incomplete_expired', 'unpaid');
declare v_changed_count integer := 0;
declare v_free_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  if exists (
    select 1 from public.subscriptions where stripe_subscription_id = p_subscription_id
      and stripe_latest_event_created_at > p_event_created_at
  ) then return false; end if;

  if not v_terminal and exists (
    select 1 from public.subscriptions
    where account_id = p_account_id and is_current
      and stripe_subscription_id is distinct from p_subscription_id
      and status not in ('canceled', 'incomplete_expired', 'unpaid')
  ) then
    raise exception 'Account % already has a different current Stripe subscription', p_account_id;
  end if;

  -- A stale terminal row must not block a legitimate replacement.
  if not v_terminal then
    update public.subscriptions set is_current = false, updated_at = now()
    where account_id = p_account_id and is_current
      and stripe_subscription_id is distinct from p_subscription_id
      and status in ('canceled', 'incomplete_expired', 'unpaid');
  end if;

  insert into public.subscriptions(
    account_id, credit_plan_id, stripe_subscription_id, stripe_customer_id,
    stripe_price_id, status, current_period_start, current_period_end,
    cancel_at_period_end, stripe_latest_event_created_at, ended_at, is_current
  ) values (
    p_account_id, p_plan_id, p_subscription_id, p_customer_id, p_price_id,
    p_status::public.subscription_status, p_period_start, p_period_end,
    p_cancel_at_period_end, p_event_created_at,
    case when v_terminal then p_event_created_at else null end, not v_terminal
  ) on conflict (stripe_subscription_id) do update set
    account_id = excluded.account_id, credit_plan_id = excluded.credit_plan_id,
    stripe_customer_id = excluded.stripe_customer_id, stripe_price_id = excluded.stripe_price_id,
    status = excluded.status, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_latest_event_created_at = excluded.stripe_latest_event_created_at,
    ended_at = excluded.ended_at, is_current = excluded.is_current,
    updated_at = now()
  where subscriptions.stripe_latest_event_created_at is null
     or subscriptions.stripe_latest_event_created_at <= excluded.stripe_latest_event_created_at;
  get diagnostics v_changed_count = row_count;

  if v_changed_count > 0 and v_terminal and not exists (
    select 1 from public.subscriptions where account_id = p_account_id and is_current
      and access_granted_at is not null
      and status in ('active', 'trialing', 'past_due', 'paused', 'unpaid')
  ) then
    update public.accounts set plan = 'free', updated_at = now() where id = p_account_id;
    select id into v_free_id from public.credit_plans
      where is_default and is_active order by created_at desc limit 1;
    if v_free_id is not null then
      perform public.reset_account_credits_for_plan(
        p_account_id, v_free_id, p_event_created_at, p_event_created_at + interval '30 days'
      );
    end if;
  end if;
  return v_changed_count > 0;
end $$;

create or replace function public.process_paid_stripe_invoice(
  p_account_id uuid, p_plan_id uuid, p_subscription_id text, p_invoice_id text,
  p_payment_intent_id text, p_amount_cents integer, p_currency text,
  p_invoice_status text, p_paid_at timestamptz, p_period_start timestamptz,
  p_period_end timestamptz, p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_subscription public.subscriptions%rowtype; v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  select * into v_subscription from public.subscriptions
    where stripe_subscription_id = p_subscription_id for update;
  if v_subscription.id is null then raise exception 'Subscription % not found', p_subscription_id; end if;

  select * into v_payment from public.payments where stripe_invoice_id = p_invoice_id for update;
  if found and v_payment.credits_granted_at is not null then return false; end if;
  if found and v_payment.status = 'refunded'
    and v_payment.stripe_event_created_at > p_event_created_at then return false; end if;

  insert into public.payments(
    account_id, subscription_id, stripe_payment_intent_id, stripe_invoice_id,
    amount_cents, currency, status, invoice_status, paid_at,
    stripe_event_created_at, failure_message
  ) values (
    p_account_id, v_subscription.id, p_payment_intent_id, p_invoice_id,
    p_amount_cents, p_currency, 'succeeded', p_invoice_status, p_paid_at,
    p_event_created_at, null
  ) on conflict (stripe_invoice_id) do update set
    account_id = excluded.account_id, subscription_id = excluded.subscription_id,
    stripe_payment_intent_id = excluded.stripe_payment_intent_id,
    amount_cents = excluded.amount_cents, currency = excluded.currency,
    status = 'succeeded', invoice_status = excluded.invoice_status,
    paid_at = excluded.paid_at, stripe_event_created_at = excluded.stripe_event_created_at,
    failure_message = null, updated_at = now();

  -- A late invoice must never resurrect a subscription already made terminal.
  if v_subscription.is_current and v_subscription.status not in ('canceled', 'incomplete_expired', 'unpaid') then
    -- Checkout/subscription events may persist state, but paid access starts only here.
    update public.subscriptions set access_granted_at = coalesce(access_granted_at, p_paid_at),
      updated_at = now() where id = v_subscription.id;
    update public.accounts set plan = 'paid', updated_at = now() where id = p_account_id;
    perform public.reset_account_credits_for_plan(
      p_account_id, p_plan_id, p_period_start, p_period_end
    );
    if p_amount_cents > 0 then
      perform public.create_affiliate_commission_for_payment(p_invoice_id);
    end if;
    update public.payments set credits_granted_at = now(), updated_at = now()
      where stripe_invoice_id = p_invoice_id;
    return true;
  end if;
  return false;
end $$;

create or replace function public.record_failed_stripe_invoice(
  p_account_id uuid, p_subscription_id text, p_invoice_id text,
  p_payment_intent_id text, p_amount_cents integer, p_currency text,
  p_invoice_status text, p_event_created_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_subscription_row_id uuid;
begin
  select id into v_subscription_row_id from public.subscriptions
    where stripe_subscription_id = p_subscription_id;
  insert into public.payments(
    account_id, subscription_id, stripe_payment_intent_id, stripe_invoice_id,
    amount_cents, currency, status, invoice_status, stripe_event_created_at, failure_message
  ) values (
    p_account_id, v_subscription_row_id, p_payment_intent_id, p_invoice_id,
    p_amount_cents, p_currency, 'failed', p_invoice_status, p_event_created_at,
    'Stripe invoice payment failed'
  ) on conflict (stripe_invoice_id) do update set
    status = 'failed', invoice_status = excluded.invoice_status,
    stripe_event_created_at = excluded.stripe_event_created_at,
    failure_message = excluded.failure_message, updated_at = now()
  where payments.status not in ('succeeded', 'refunded')
    and (payments.stripe_event_created_at is null
      or payments.stripe_event_created_at <= excluded.stripe_event_created_at);
end $$;


create or replace function public.process_stripe_refund(
  p_invoice_id text, p_event_created_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments
    where stripe_invoice_id = p_invoice_id for update;
  if not found then return; end if;
  if v_payment.stripe_event_created_at is not null
    and v_payment.stripe_event_created_at > p_event_created_at then return; end if;
  update public.payments set status = 'refunded', stripe_event_created_at = p_event_created_at,
    updated_at = now() where id = v_payment.id;
  perform public.reverse_affiliate_commission_for_invoice(p_invoice_id);
end $$;

revoke all on function public.claim_stripe_webhook_event(text,text,timestamptz,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.sync_stripe_subscription(uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.process_paid_stripe_invoice(uuid,uuid,text,text,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.record_failed_stripe_invoice(uuid,text,text,text,integer,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.process_stripe_refund(text,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text,text,timestamptz,uuid,jsonb) to service_role;
grant execute on function public.sync_stripe_subscription(uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz) to service_role;
grant execute on function public.process_paid_stripe_invoice(uuid,uuid,text,text,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.record_failed_stripe_invoice(uuid,text,text,text,integer,text,text,timestamptz) to service_role;
grant execute on function public.process_stripe_refund(text,timestamptz) to service_role;
