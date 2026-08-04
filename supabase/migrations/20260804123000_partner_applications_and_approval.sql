-- Public affiliate applications require review before a referral can be activated.

create type public.partner_application_status as enum ('pending', 'approved', 'rejected', 'blocked');
create type public.partner_payout_method as enum ('bank', 'paypal');

alter table public.partners
  add column if not exists application_status public.partner_application_status not null default 'approved',
  add column if not exists phone text,
  add column if not exists payout_method public.partner_payout_method,
  add column if not exists bank_account_holder text,
  add column if not exists bank_iban text,
  add column if not exists paypal_email text,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

alter table public.partners
  add constraint partners_active_requires_approval
  check (not is_active or application_status = 'approved');

-- Make generated public codes compatible with case-normalized referral URLs.
alter table public.partners disable trigger trg_partners_handle_code;
update public.partners set code = lower(code) where code <> lower(code);
alter table public.partners enable trigger trg_partners_handle_code;
create or replace function public.generate_partner_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_attempts integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then raise exception 'Could not generate a unique partner code'; end if;
    v_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    if not exists (select 1 from public.partners where code = v_code) then return v_code; end if;
  end loop;
end;
$$;

create or replace function public.trg_partners_handle_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.code is null or length(trim(NEW.code)) = 0 then NEW.code := public.generate_partner_code();
    else NEW.code := lower(trim(NEW.code)); end if;
  elsif TG_OP = 'UPDATE' then
    NEW.code := lower(trim(NEW.code));
    if NEW.code is distinct from OLD.code then raise exception 'Partner referral code is immutable'; end if;
  end if;
  return NEW;
end;
$$;

create or replace function public.submit_partner_application(
  p_name text,
  p_email text,
  p_phone text,
  p_payout_method public.partner_payout_method,
  p_bank_account_holder text default null,
  p_bank_iban text default null,
  p_paypal_email text default null,
  p_terms_version text default '2026-08-04'
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_iban text := upper(replace(trim(coalesce(p_bank_iban, '')), ' ', ''));
begin
  if length(trim(coalesce(p_name, ''))) not between 2 and 160 then raise exception 'Nurodykite vardą arba įmonės pavadinimą'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Nurodykite galiojantį el. paštą'; end if;
  if length(v_phone) < 7 or length(v_phone) > 40 then raise exception 'Nurodykite telefono numerį'; end if;
  if p_payout_method = 'bank' and (length(trim(coalesce(p_bank_account_holder, ''))) < 2 or v_iban !~ '^[A-Z]{2}[0-9A-Z]{13,32}$') then raise exception 'Banko išmokai nurodykite gavėją ir galiojantį IBAN'; end if;
  if p_payout_method = 'paypal' and lower(trim(coalesce(p_paypal_email, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Nurodykite PayPal el. paštą'; end if;
  if exists (select 1 from public.partners where type = 'affiliate' and lower(email) = v_email) then raise exception 'Paraiška su šiuo el. paštu jau pateikta'; end if;

  insert into public.partners(name, email, code, type, is_active, application_status, phone, payout_method, bank_account_holder, bank_iban, paypal_email, terms_version, terms_accepted_at, submitted_at)
  values (trim(p_name), v_email, null, 'affiliate', false, 'pending', v_phone, p_payout_method,
    case when p_payout_method = 'bank' then trim(p_bank_account_holder) end,
    case when p_payout_method = 'bank' then v_iban end,
    case when p_payout_method = 'paypal' then lower(trim(p_paypal_email)) end,
    left(coalesce(nullif(trim(p_terms_version), ''), '2026-08-04'), 50), now(), now());
end;
$$;

create or replace function public.approve_partner_application(p_partner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_partner public.partners%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  select * into v_partner from public.partners where id = p_partner_id and type = 'affiliate' for update;
  if not found then raise exception 'Partner not found'; end if;
  if v_partner.application_status <> 'pending' then raise exception 'Only pending applications can be approved'; end if;
  if v_partner.phone is null or v_partner.payout_method is null or v_partner.terms_accepted_at is null then raise exception 'Trūksta privalomų partnerio duomenų'; end if;
  update public.partners set application_status = 'approved', is_active = true, approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p_partner_id;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'affiliate_partner_approved', 'partner', p_partner_id::text, jsonb_build_object('email', v_partner.email));
end;
$$;

create or replace function public.set_partner_application_status(p_partner_id uuid, p_status public.partner_application_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_status not in ('rejected', 'blocked') then raise exception 'Invalid status'; end if;
  update public.partners set application_status = p_status, is_active = false, updated_at = now() where id = p_partner_id and type = 'affiliate';
  if not found then raise exception 'Partner not found'; end if;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'affiliate_partner_' || p_status::text, 'partner', p_partner_id::text, '{}'::jsonb);
end;
$$;

grant execute on function public.submit_partner_application(text, text, text, public.partner_payout_method, text, text, text, text) to anon, authenticated;
grant execute on function public.approve_partner_application(uuid), public.set_partner_application_status(uuid, public.partner_application_status) to authenticated;


-- Snapshot the configured commission period at attribution time.
alter table public.platform_partner_attributions
  add column if not exists commission_months integer not null default 12
  check (commission_months between 1 and 60);

create or replace function public.record_platform_partner_click(
  p_code text, p_visitor_token_hash text, p_landing_path text default '/', p_referrer_url text default null,
  p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null
)
returns table(click_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_partner public.partners%rowtype; v_click_id uuid; v_expires_at timestamptz;
begin
  select * into v_partner from public.partners where code = lower(trim(p_code)) and type = 'affiliate' and is_active = true;
  if not found then return; end if;
  if p_visitor_token_hash is null or length(p_visitor_token_hash) < 32 then raise exception 'Invalid visitor token'; end if;
  insert into public.platform_partner_clicks(partner_id, visitor_token_hash, landing_path, referrer_url, utm_source, utm_medium, utm_campaign)
  values (v_partner.id, p_visitor_token_hash, left(coalesce(p_landing_path, '/'), 500), left(p_referrer_url, 2000), left(p_utm_source, 200), left(p_utm_medium, 200), left(p_utm_campaign, 200)) returning id into v_click_id;
  select id, expires_at into click_id, v_expires_at from public.platform_partner_attributions
  where visitor_token_hash = p_visitor_token_hash and account_id is null and status = 'active' and expires_at > now() order by attributed_at asc limit 1;
  if click_id is null then
    v_expires_at := now() + make_interval(days => v_partner.attribution_window_days);
    insert into public.platform_partner_attributions(partner_id, click_id, visitor_token_hash, expires_at, commission_rate_bps, commission_months, payout_hold_days)
    values (v_partner.id, v_click_id, p_visitor_token_hash, v_expires_at, v_partner.commission_rate_bps, v_partner.commission_months, v_partner.payout_hold_days);
  end if;
  return query select v_click_id, v_expires_at;
end;
$$;

create or replace function public.create_affiliate_commission_for_payment(p_stripe_invoice_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_payment public.payments%rowtype; v_attribution public.platform_partner_attributions%rowtype; v_commission_id uuid; v_first_paid_at timestamptz;
begin
  select * into v_payment from public.payments where stripe_invoice_id = p_stripe_invoice_id and status = 'succeeded';
  if not found then return null; end if;
  select * into v_attribution from public.platform_partner_attributions where account_id = v_payment.account_id and status = 'active' for update;
  if not found then return null; end if;
  if v_attribution.expires_at < now() then update public.platform_partner_attributions set status = 'expired' where id = v_attribution.id; return null; end if;
  v_first_paid_at := coalesce(v_attribution.first_paid_at, v_payment.paid_at, now());
  if v_attribution.first_paid_at is null then
    update public.platform_partner_attributions set first_paid_at = v_first_paid_at, commission_ends_at = v_first_paid_at + make_interval(months => v_attribution.commission_months) where id = v_attribution.id returning * into v_attribution;
  end if;
  if v_attribution.commission_ends_at <= coalesce(v_payment.paid_at, now()) then return null; end if;
  insert into public.affiliate_commissions(partner_id, attribution_id, account_id, payment_id, source_stripe_invoice_id, source_type, amount_cents, currency, commission_rate_bps, available_at)
  values (v_attribution.partner_id, v_attribution.id, v_payment.account_id, v_payment.id, p_stripe_invoice_id, 'payment', round(v_payment.amount_cents * v_attribution.commission_rate_bps / 10000.0)::integer, v_payment.currency, v_attribution.commission_rate_bps, now() + make_interval(days => v_attribution.payout_hold_days))
  on conflict (source_stripe_invoice_id, source_type) do nothing returning id into v_commission_id;
  return v_commission_id;
end;
$$;

-- Administrative records may omit a code; it is generated by the trigger and never changed afterwards.
create or replace function public.upsert_platform_partner(
  p_partner_id uuid default null, p_name text default null, p_email text default null, p_code text default null,
  p_is_active boolean default true, p_commission_rate_bps integer default 3000, p_commission_months integer default 12,
  p_attribution_window_days integer default 90, p_payout_hold_days integer default 30, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not permitted'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Partner name is required'; end if;
  if p_partner_id is null then
    insert into public.partners(name, email, code, type, is_active, application_status, commission_rate_bps, commission_months, attribution_window_days, payout_hold_days, notes)
    values (trim(p_name), nullif(lower(trim(p_email)), ''), nullif(lower(trim(p_code)), ''), 'affiliate', p_is_active, 'approved', p_commission_rate_bps, p_commission_months, p_attribution_window_days, p_payout_hold_days, nullif(trim(p_notes), '')) returning id into v_id;
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata) values (auth.uid(), 'affiliate_partner_created', 'partner', v_id::text, jsonb_build_object('code_generated', p_code is null or trim(p_code) = ''));
  else
    update public.partners set name = trim(p_name), email = nullif(lower(trim(p_email)), ''), is_active = case when application_status = 'approved' then p_is_active else false end, commission_rate_bps = p_commission_rate_bps, commission_months = p_commission_months, attribution_window_days = p_attribution_window_days, payout_hold_days = p_payout_hold_days, notes = nullif(trim(p_notes), ''), updated_at = now() where id = p_partner_id and type = 'affiliate' returning id into v_id;
    if v_id is null then raise exception 'Partner not found'; end if;
    insert into public.admin_audit_logs(actor_id, action, target_type, target_id, metadata) values (auth.uid(), 'affiliate_partner_updated', 'partner', v_id::text, jsonb_build_object('is_active', p_is_active));
  end if;
  return v_id;
end;
$$;
