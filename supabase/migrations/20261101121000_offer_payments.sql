-- The account chooses one provider for the offer shown at the end of a webinar.
-- Credentials stay in Vault through integration_connections.

alter table public.webinar_offers
  add column if not exists price_cents integer
  check (price_cents is null or price_cents > 0);

alter table public.registrations
  add column if not exists offer_paid_at timestamptz;

create table if not exists public.account_payment_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider public.integration_provider not null,
  updated_at timestamptz not null default now(),
  constraint account_payment_settings_provider_check
    check (provider in ('paysera', 'stripe', 'paypal'))
);

create table if not exists public.offer_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  provider public.integration_provider not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EUR',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  external_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists offer_orders_registration_id_idx
  on public.offer_orders (registration_id);

alter table public.account_payment_settings enable row level security;
alter table public.offer_orders enable row level security;

grant select on public.account_payment_settings to authenticated;
revoke all on public.offer_orders from anon, authenticated;

drop policy if exists "Payment settings: account admins can view" on public.account_payment_settings;
create policy "Payment settings: account admins can view"
  on public.account_payment_settings
  for select to authenticated
  using (
    public.has_account_role(account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );

create or replace function public.set_account_payment_provider(
  p_account_id uuid,
  p_provider public.integration_provider
)
returns public.account_payment_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.account_payment_settings;
begin
  if auth.uid() is null or not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized to choose the payment provider';
  end if;

  if p_provider not in ('paysera', 'stripe', 'paypal') then
    raise exception 'Unsupported payment provider';
  end if;

  if not exists (
    select 1 from public.integration_connections
    where account_id = p_account_id
      and provider = p_provider
      and status = 'active'
  ) then
    raise exception 'Save this provider before selecting it';
  end if;

  insert into public.account_payment_settings (account_id, provider)
  values (p_account_id, p_provider)
  on conflict (account_id) do update
  set provider = excluded.provider, updated_at = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.set_account_payment_provider(uuid, public.integration_provider) from public;
grant execute on function public.set_account_payment_provider(uuid, public.integration_provider) to authenticated;

create or replace function public.set_webinar_cta_live_visibility(
  p_webinar_id uuid, p_is_visible boolean
) returns public.webinar_cta_live_state
language plpgsql security definer set search_path = public
as $$
declare result public.webinar_cta_live_state;
begin
  if not public.can_moderate_webinar(p_webinar_id) then
    raise exception 'Not allowed to control webinar CTA' using errcode = '42501';
  end if;
  if p_is_visible and not exists (
    select 1 from public.webinar_offers
    where webinar_id = p_webinar_id
      and active
      and (target_url is not null or price_cents is not null)
  ) then
    raise exception 'Configure an active offer with a price or a target URL first';
  end if;
  insert into public.webinar_cta_live_state(webinar_id, is_visible, changed_at, changed_by)
  values (p_webinar_id, p_is_visible, now(), auth.uid())
  on conflict (webinar_id) do update
  set is_visible = excluded.is_visible, changed_at = excluded.changed_at, changed_by = excluded.changed_by
  returning * into result;
  return result;
end;
$$;
