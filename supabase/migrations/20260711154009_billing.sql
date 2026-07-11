-- -----------------------------------------------------------------
-- Billing, credits, and usage events
-- -----------------------------------------------------------------

create type public.credit_type as enum (
  'live_webinar_minute',
  'automated_webinar_minute',
  'recording_storage_gb_month',
  'registration',
  'email_sent',
  'sms_sent',
  'ai_token',
  'support_ticket'
);

create type public.usage_event_scope as enum ('webinar', 'recording', 'storage', 'ai', 'other');
create type public.subscription_status as enum ('incomplete', 'active', 'past_due', 'canceled', 'paused', 'trialing');

create table public.credit_plans (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  stripe_price_id text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  monthly_credits jsonb not null default '{}',
  limits jsonb not null default '{}',
  price_cents int not null default 0,
  interval text not null default 'month' check (interval in ('month', 'year')),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.credit_plans is 'Available pricing plans with monthly credit allocations.';

insert into public.credit_plans (name, is_active, is_default, monthly_credits, limits, price_cents, interval)
values
  ('Free', true, true, '{"registration": 100, "live_webinar_minute": 60, "automated_webinar_minute": 60, "recording_storage_gb_month": 1}', '{"max_webinars": 1, "max_storage_bytes": 1073741824}', 0, 'month'),
  ('Growth', true, false, '{"registration": 1000, "live_webinar_minute": 600, "automated_webinar_minute": 600, "recording_storage_gb_month": 10}', '{"max_webinars": 10, "max_storage_bytes": 10737418240}', 2900, 'month'),
  ('Scale', true, false, '{"registration": 10000, "live_webinar_minute": 5000, "automated_webinar_minute": 5000, "recording_storage_gb_month": 100}', '{"max_webinars": 100, "max_storage_bytes": 107374182400}', 9900, 'month')
on conflict do nothing;

create table public.account_credits (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  credit_type public.credit_type not null,
  balance int not null default 0,
  rollover_balance int not null default 0,
  period_started_at timestamptz not null default now (),
  period_ends_at timestamptz not null default (now () + interval '1 month'),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (account_id, credit_type)
);

comment on table public.account_credits is 'Remaining credits per account and credit type for current billing period.';

create index idx_account_credits_account_id on public.account_credits (account_id);

create table public.usage_events (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  credit_type public.credit_type,
  scope public.usage_event_scope not null default 'other',
  scope_id uuid,
  quantity int not null default 1,
  metadata jsonb default '{}',
  created_at timestamptz not null default now ()
);

create index idx_usage_events_account_id on public.usage_events (account_id, created_at desc);
create index idx_usage_events_scope on public.usage_events (scope, scope_id);

comment on table public.usage_events is 'Raw usage events to be aggregated into credit consumption.';

create table public.billing_customers (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  name text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.billing_customers is 'Stripe customer mapping for accounts.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  credit_plan_id uuid references public.credit_plans (id) on delete set null,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status public.subscription_status not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index idx_subscriptions_account_id on public.subscriptions (account_id);
create index idx_subscriptions_stripe_id on public.subscriptions (stripe_subscription_id);

comment on table public.subscriptions is 'Active/past subscriptions for an account.';

create table public.payments (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index idx_payments_account_id on public.payments (account_id);
create index idx_payments_stripe_intent on public.payments (stripe_payment_intent_id);

comment on table public.payments is 'Individual payment records for invoices/top-ups.';

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.credit_plans enable row level security;
alter table public.account_credits enable row level security;
alter table public.usage_events enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

grant select on public.credit_plans to authenticated;
grant select, insert, update, delete on public.account_credits to authenticated;
grant select, insert on public.usage_events to authenticated;
grant select, insert, update on public.billing_customers to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select, insert, update on public.payments to authenticated;

drop policy if exists "Credit plans: public read" on public.credit_plans;
create policy "Credit plans: public read"
  on public.credit_plans
  for select
  to authenticated
  using (true);

drop policy if exists "Account credits: account members can view" on public.account_credits;
create policy "Account credits: account members can view"
  on public.account_credits
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Usage events: account members can view" on public.usage_events;
create policy "Usage events: account members can view"
  on public.usage_events
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Billing customers: account members can view" on public.billing_customers;
create policy "Billing customers: account members can view"
  on public.billing_customers
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Subscriptions: account members can view" on public.subscriptions;
create policy "Subscriptions: account members can view"
  on public.subscriptions
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Payments: account members can view" on public.payments;
create policy "Payments: account members can view"
  on public.payments
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());
