-- Platform subscription affiliate program: attribution, commission ledger, and payouts.

create type public.affiliate_attribution_status as enum ('active', 'expired', 'revoked');
create type public.affiliate_commission_status as enum ('pending', 'available', 'held', 'reversed', 'paid');
create type public.affiliate_payout_status as enum ('draft', 'paid', 'cancelled');

alter table public.partners
  add column if not exists commission_rate_bps integer not null default 3000
    check (commission_rate_bps between 0 and 10000),
  add column if not exists commission_months integer not null default 12
    check (commission_months between 1 and 60),
  add column if not exists attribution_window_days integer not null default 90
    check (attribution_window_days between 1 and 365),
  add column if not exists payout_hold_days integer not null default 30
    check (payout_hold_days between 0 and 365),
  add column if not exists notes text;

create table public.platform_partner_clicks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  visitor_token_hash text not null,
  landing_path text not null default '/',
  referrer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  clicked_at timestamptz not null default now()
);

create index idx_platform_partner_clicks_partner on public.platform_partner_clicks(partner_id, clicked_at desc);
create index idx_platform_partner_clicks_visitor on public.platform_partner_clicks(visitor_token_hash, clicked_at desc);

create table public.platform_partner_attributions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  click_id uuid references public.platform_partner_clicks(id) on delete set null,
  visitor_token_hash text not null,
  account_id uuid unique references public.accounts(id) on delete restrict,
  attributed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  first_paid_at timestamptz,
  commission_ends_at timestamptz,
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 10000),
  payout_hold_days integer not null check (payout_hold_days between 0 and 365),
  status public.affiliate_attribution_status not null default 'active'
);

create index idx_platform_partner_attributions_partner on public.platform_partner_attributions(partner_id, attributed_at desc);
create index idx_platform_partner_attributions_visitor on public.platform_partner_attributions(visitor_token_hash, expires_at desc)
  where account_id is null and status = 'active';

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  attribution_id uuid not null references public.platform_partner_attributions(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  source_stripe_invoice_id text not null,
  source_type text not null check (source_type in ('payment', 'reversal')),
  amount_cents integer not null,
  currency text not null default 'eur',
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 10000),
  available_at timestamptz not null,
  status public.affiliate_commission_status not null default 'pending',
  reversal_of_id uuid references public.affiliate_commissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(source_stripe_invoice_id, source_type)
);

create index idx_affiliate_commissions_partner on public.affiliate_commissions(partner_id, status, created_at desc);
create index idx_affiliate_commissions_available on public.affiliate_commissions(status, available_at);

create table public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur',
  status public.affiliate_payout_status not null default 'draft',
  payment_reference text,
  notes text,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_payout_items (
  payout_id uuid not null references public.affiliate_payouts(id) on delete cascade,
  commission_id uuid not null unique references public.affiliate_commissions(id) on delete restrict,
  primary key(payout_id, commission_id)
);

alter table public.platform_partner_clicks enable row level security;
alter table public.platform_partner_attributions enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_payout_items enable row level security;

create policy "Platform partner clicks: admin read" on public.platform_partner_clicks for select to authenticated using (public.is_platform_admin());
create policy "Platform partner attributions: admin read" on public.platform_partner_attributions for select to authenticated using (public.is_platform_admin());
create policy "Affiliate commissions: admin read" on public.affiliate_commissions for select to authenticated using (public.is_platform_admin());
create policy "Affiliate payouts: admin read" on public.affiliate_payouts for select to authenticated using (public.is_platform_admin());
create policy "Affiliate payout items: admin read" on public.affiliate_payout_items for select to authenticated using (public.is_platform_admin());

grant select on public.platform_partner_clicks, public.platform_partner_attributions, public.affiliate_commissions, public.affiliate_payouts, public.affiliate_payout_items to authenticated;

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
  v_expires_at timestamptz;
begin
  select * into v_partner from public.partners
  where code = lower(trim(p_code)) and type = 'affiliate' and is_active = true;
  if not found then return; end if;
  if p_visitor_token_hash is null or length(p_visitor_token_hash) < 32 then
    raise exception 'Invalid visitor token';
  end if;

  insert into public.platform_partner_clicks(partner_id, visitor_token_hash, landing_path, referrer_url, utm_source, utm_medium, utm_campaign)
  values (v_partner.id, p_visitor_token_hash, left(coalesce(p_landing_path, '/'), 500), left(p_referrer_url, 2000), left(p_utm_source, 200), left(p_utm_medium, 200), left(p_utm_campaign, 200))
  returning id into v_click_id;

  select id, expires_at into click_id, v_expires_at
  from public.platform_partner_attributions
  where visitor_token_hash = p_visitor_token_hash and account_id is null and status = 'active' and expires_at > now()
  order by attributed_at asc limit 1;

  if click_id is null then
    v_expires_at := now() + make_interval(days => v_partner.attribution_window_days);
    insert into public.platform_partner_attributions(partner_id, click_id, visitor_token_hash, expires_at, commission_rate_bps, payout_hold_days)
    values (v_partner.id, v_click_id, p_visitor_token_hash, v_expires_at, v_partner.commission_rate_bps, v_partner.payout_hold_days);
  end if;
  return query select v_click_id, v_expires_at;
end;
$$;

grant execute on function public.record_platform_partner_click(text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.claim_platform_partner_attribution(p_account_id uuid, p_visitor_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_attribution_id uuid;
begin
  if auth.uid() is null or not public.is_account_member(p_account_id) then
    raise exception 'Not permitted';
  end if;
  select id into v_attribution_id from public.platform_partner_attributions
  where visitor_token_hash = p_visitor_token_hash and account_id is null and status = 'active' and expires_at > now()
  order by attributed_at asc limit 1 for update;
  if v_attribution_id is not null then
    update public.platform_partner_attributions set account_id = p_account_id where id = v_attribution_id;
  end if;
  return v_attribution_id;
end;
$$;

grant execute on function public.claim_platform_partner_attribution(uuid, text) to authenticated;

create or replace function public.create_affiliate_commission_for_payment(p_stripe_invoice_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_attribution public.platform_partner_attributions%rowtype;
  v_commission_id uuid;
  v_first_paid_at timestamptz;
begin
  select * into v_payment from public.payments where stripe_invoice_id = p_stripe_invoice_id and status = 'succeeded';
  if not found then return null; end if;
  select * into v_attribution from public.platform_partner_attributions where account_id = v_payment.account_id and status = 'active' for update;
  if not found then return null; end if;
  if v_attribution.expires_at < now() then
    update public.platform_partner_attributions set status = 'expired' where id = v_attribution.id;
    return null;
  end if;
  v_first_paid_at := coalesce(v_attribution.first_paid_at, v_payment.paid_at, now());
  if v_attribution.first_paid_at is null then
    update public.platform_partner_attributions
    set first_paid_at = v_first_paid_at, commission_ends_at = v_first_paid_at + interval '12 months'
    where id = v_attribution.id
    returning * into v_attribution;
  end if;
  if v_attribution.commission_ends_at <= coalesce(v_payment.paid_at, now()) then return null; end if;
  insert into public.affiliate_commissions(partner_id, attribution_id, account_id, payment_id, source_stripe_invoice_id, source_type, amount_cents, currency, commission_rate_bps, available_at)
  values (v_attribution.partner_id, v_attribution.id, v_payment.account_id, v_payment.id, p_stripe_invoice_id, 'payment', round(v_payment.amount_cents * v_attribution.commission_rate_bps / 10000.0)::integer, v_payment.currency, v_attribution.commission_rate_bps, now() + make_interval(days => v_attribution.payout_hold_days))
  on conflict (source_stripe_invoice_id, source_type) do nothing
  returning id into v_commission_id;
  return v_commission_id;
end;
$$;

create or replace function public.reverse_affiliate_commission_for_invoice(p_stripe_invoice_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_source public.affiliate_commissions%rowtype; v_id uuid;
begin
  select * into v_source from public.affiliate_commissions
  where source_stripe_invoice_id = p_stripe_invoice_id and source_type = 'payment'
  order by created_at asc limit 1;
  if not found then return null; end if;
  insert into public.affiliate_commissions(partner_id, attribution_id, account_id, payment_id, source_stripe_invoice_id, source_type, amount_cents, currency, commission_rate_bps, available_at, status, reversal_of_id)
  values (v_source.partner_id, v_source.attribution_id, v_source.account_id, v_source.payment_id, p_stripe_invoice_id, 'reversal', -v_source.amount_cents, v_source.currency, v_source.commission_rate_bps, now(), 'reversed', v_source.id)
  on conflict (source_stripe_invoice_id, source_type) do nothing
  returning id into v_id;
  if v_id is not null and v_source.status in ('pending', 'available', 'held') then
    update public.affiliate_commissions set status = 'reversed' where id = v_source.id;
  end if;
  return v_id;
end;
$$;

create or replace function public.release_available_affiliate_commissions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.affiliate_commissions set status = 'available'
  where status = 'pending' and amount_cents > 0 and available_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_affiliate_payout(p_partner_id uuid, p_commission_ids uuid[], p_payment_reference text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_payout_id uuid; v_total integer;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  select coalesce(sum(amount_cents), 0) into v_total from public.affiliate_commissions
  where id = any(p_commission_ids) and partner_id = p_partner_id and status = 'available' and amount_cents > 0;
  if v_total <= 0 or v_total <> (select coalesce(sum(amount_cents), 0) from public.affiliate_commissions where id = any(p_commission_ids)) then
    raise exception 'Only available positive commissions from this partner can be paid';
  end if;
  insert into public.affiliate_payouts(partner_id, amount_cents, payment_reference, notes, created_by)
  values (p_partner_id, v_total, left(p_payment_reference, 500), left(p_notes, 5000), auth.uid()) returning id into v_payout_id;
  insert into public.affiliate_payout_items(payout_id, commission_id) select v_payout_id, unnest(p_commission_ids);
  update public.affiliate_commissions set status = 'paid' where id = any(p_commission_ids);
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'affiliate_payout_created', 'affiliate_payout', v_payout_id::text, jsonb_build_object('partner_id', p_partner_id, 'amount_cents', v_total, 'commission_ids', p_commission_ids));
  return v_payout_id;
end;
$$;

grant execute on function public.create_affiliate_commission_for_payment(text), public.reverse_affiliate_commission_for_invoice(text), public.release_available_affiliate_commissions(), public.create_affiliate_payout(uuid, uuid[], text, text) to authenticated;


create or replace function public.upsert_platform_partner(
  p_partner_id uuid default null,
  p_name text default null,
  p_email text default null,
  p_code text default null,
  p_is_active boolean default true,
  p_commission_rate_bps integer default 3000,
  p_commission_months integer default 12,
  p_attribution_window_days integer default 90,
  p_payout_hold_days integer default 30,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Partner name is required'; end if;
  if p_code is null or p_code !~ '^[a-z0-9][a-z0-9-]{2,63}$' then raise exception 'Invalid partner code'; end if;
  if p_partner_id is null then
    insert into public.partners(name, email, code, type, is_active, commission_rate_bps, commission_months, attribution_window_days, payout_hold_days, notes)
    values (trim(p_name), nullif(trim(p_email), ''), lower(trim(p_code)), 'affiliate', p_is_active, p_commission_rate_bps, p_commission_months, p_attribution_window_days, p_payout_hold_days, nullif(trim(p_notes), ''))
    returning id into v_id;
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'affiliate_partner_created', 'partner', v_id::text, jsonb_build_object('code', lower(trim(p_code))));
  else
    update public.partners set name = trim(p_name), email = nullif(trim(p_email), ''), code = lower(trim(p_code)), is_active = p_is_active, commission_rate_bps = p_commission_rate_bps, commission_months = p_commission_months, attribution_window_days = p_attribution_window_days, payout_hold_days = p_payout_hold_days, notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = p_partner_id and type = 'affiliate' returning id into v_id;
    if v_id is null then raise exception 'Partner not found'; end if;
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'affiliate_partner_updated', 'partner', v_id::text, jsonb_build_object('is_active', p_is_active, 'code', lower(trim(p_code))));
  end if;
  return v_id;
end;
$$;

create or replace function public.mark_affiliate_payout_paid(p_payout_id uuid, p_payment_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_payout public.affiliate_payouts%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  select * into v_payout from public.affiliate_payouts where id = p_payout_id for update;
  if not found or v_payout.status <> 'draft' then raise exception 'Payout is not payable'; end if;
  update public.affiliate_payouts set status = 'paid', paid_at = now(), payment_reference = coalesce(nullif(trim(p_payment_reference), ''), payment_reference), updated_at = now() where id = p_payout_id;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'affiliate_payout_paid', 'affiliate_payout', p_payout_id::text, jsonb_build_object('amount_cents', v_payout.amount_cents));
end;
$$;

grant execute on function public.upsert_platform_partner(uuid, text, text, text, boolean, integer, integer, integer, integer, text), public.mark_affiliate_payout_paid(uuid, text) to authenticated;


drop function if exists public.get_platform_admin_overview();
create function public.get_platform_admin_overview()
returns table (
  accounts_count bigint,
  users_count bigint,
  paid_subscriptions_count bigint,
  past_due_subscriptions_count bigint,
  payments_cents bigint,
  affiliate_payable_cents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.accounts),
    (select count(*) from public.profiles),
    (select count(*) from public.subscriptions where status in ('active', 'trialing')),
    (select count(*) from public.subscriptions where status = 'past_due'),
    (select coalesce(sum(amount_cents), 0) from public.payments where status = 'succeeded'),
    (select coalesce(sum(amount_cents), 0) from public.affiliate_commissions where status = 'available' and amount_cents > 0);
$$;
grant execute on function public.get_platform_admin_overview() to authenticated;
