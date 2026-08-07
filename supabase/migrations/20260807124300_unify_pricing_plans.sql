-- Canonical public and in-app pricing. Stripe price IDs remain NULL until configured in Stripe.
-- Admin action: create the corresponding EUR recurring prices in Stripe, then update
-- credit_plans.stripe_price_id before paid plans become purchasable in the Billing page.

-- Retire every previous catalog entry while preserving historical subscription references.
update public.credit_plans
set is_active = false,
    is_default = false,
    updated_at = now()
where is_active = true;

-- Free is monthly-only. Paid annual amounts apply the agreed 20% discount:
-- Start €182.40/year, Grow €374.40/year, Scale €758.40/year.
insert into public.credit_plans (
  name, stripe_price_id, is_active, is_default, monthly_credits, limits, price_cents, interval
)
values
  (
    'Free', null, true, true,
    '{"live_webinar_minute":60,"automated_webinar_minute":60,"registration":30,"recording_storage_gb_month":1,"ai_token":50000}'::jsonb,
    '{"max_webinars":1,"max_participants_per_webinar":30,"max_team_members":1,"max_storage_bytes":1073741824}'::jsonb,
    0, 'month'
  ),
  (
    'Start', null, true, false,
    '{"live_webinar_minute":300,"automated_webinar_minute":300,"registration":1000,"recording_storage_gb_month":10,"ai_token":500000}'::jsonb,
    '{"max_webinars":1,"max_participants_per_webinar":100,"max_team_members":1,"max_storage_bytes":10737418240}'::jsonb,
    1900, 'month'
  ),
  (
    'Start', null, true, false,
    '{"live_webinar_minute":300,"automated_webinar_minute":300,"registration":1000,"recording_storage_gb_month":10,"ai_token":500000}'::jsonb,
    '{"max_webinars":1,"max_participants_per_webinar":100,"max_team_members":1,"max_storage_bytes":10737418240}'::jsonb,
    18240, 'year'
  ),
  (
    'Grow', null, true, false,
    '{"live_webinar_minute":1200,"automated_webinar_minute":1200,"registration":5000,"recording_storage_gb_month":50,"ai_token":2500000}'::jsonb,
    '{"max_webinars":3,"max_participants_per_webinar":500,"max_team_members":3,"max_storage_bytes":53687091200}'::jsonb,
    3900, 'month'
  ),
  (
    'Grow', null, true, false,
    '{"live_webinar_minute":1200,"automated_webinar_minute":1200,"registration":5000,"recording_storage_gb_month":50,"ai_token":2500000}'::jsonb,
    '{"max_webinars":3,"max_participants_per_webinar":500,"max_team_members":3,"max_storage_bytes":53687091200}'::jsonb,
    37440, 'year'
  ),
  (
    'Scale', null, true, false,
    '{"live_webinar_minute":5000,"automated_webinar_minute":5000,"registration":20000,"recording_storage_gb_month":200,"ai_token":10000000}'::jsonb,
    '{"max_webinars":10,"max_participants_per_webinar":2000,"max_team_members":10,"max_storage_bytes":214748364800}'::jsonb,
    7900, 'month'
  ),
  (
    'Scale', null, true, false,
    '{"live_webinar_minute":5000,"automated_webinar_minute":5000,"registration":20000,"recording_storage_gb_month":200,"ai_token":10000000}'::jsonb,
    '{"max_webinars":10,"max_participants_per_webinar":2000,"max_team_members":10,"max_storage_bytes":214748364800}'::jsonb,
    75840, 'year'
  );

-- Point active legacy subscriptions at their matching canonical monthly plan so the in-app
-- plan label and limits remain accurate. Historical canceled subscriptions remain untouched.
update public.subscriptions s
set
  credit_plan_id = canonical.id,
  updated_at = now()
from public.credit_plans legacy
join public.credit_plans canonical
  on canonical.is_active = true
  and canonical.interval = 'month'
  and canonical.name = case legacy.name when 'Growth' then 'Grow' else legacy.name end
where s.credit_plan_id = legacy.id
  and legacy.is_active = false
  and s.status in ('incomplete', 'active', 'past_due', 'paused', 'trialing');

comment on column public.credit_plans.stripe_price_id is
  'Stripe recurring price ID. Populate via admin action after creating the matching EUR Stripe price; NULL plans are intentionally not purchasable.';

-- Backfill missing credit rows from the new default Free allocation without changing
-- balances or billing periods already assigned to existing accounts.
insert into public.account_credits (
  account_id, credit_type, balance, rollover_balance, period_started_at, period_ends_at
)
select
  a.id,
  allocation.key::public.credit_type,
  greatest(allocation.value::integer, 0),
  0,
  now(),
  now() + interval '1 month'
from public.accounts a
join public.credit_plans p on p.is_default = true and p.is_active = true
cross join lateral jsonb_each_text(p.monthly_credits) as allocation(key, value)
on conflict (account_id, credit_type) do nothing;
