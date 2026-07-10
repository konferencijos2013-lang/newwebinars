-- ---------------------------------------------------------------------
-- Partner / affiliate referral support
-- ---------------------------------------------------------------------
-- This is a simple, flat, one-level referral model. The partners table
-- may later hold broader SaaS/business partner types; `type` keeps those
-- separate from affiliate/referral partners.
-- ---------------------------------------------------------------------

create type public.partner_type as enum ('affiliate', 'business');

create table public.partners (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  email text,
  code text not null unique,
  type public.partner_type not null default 'affiliate',
  is_active boolean not null default true,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.partners is 'Platform partners. Use `type` to distinguish affiliate/referral partners from future broader SaaS partner workflows.';
comment on column public.partners.code is 'Unique public affiliate/referral code used in links.';
comment on column public.partners.type is 'affiliate = simple one-level referral partner; business = reserved for future broader partner workflows.';

create unique index idx_partners_code on public.partners (code);
create index idx_partners_type_active on public.partners (type, is_active);

-- Attribute webinar registrations to an affiliate by code.
alter table public.registrations
  add column referral_code text references public.partners (code) on update cascade on delete set null;

create index idx_registrations_referral_code on public.registrations (referral_code);

-- Validate an affiliate code without exposing the partners table to callers.
create or replace function public.is_active_partner_code (p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.partners
    where code = p_code and type = 'affiliate' and is_active = true
  );
end;
$$;

comment on function public.is_active_partner_code (text) is 'True if the code belongs to an active affiliate partner. SECURITY DEFINER so the partners table stays private.';

alter function public.is_active_partner_code (text) owner to postgres;

-- RLS on partners: platform admins only.
alter table public.partners enable row level security;

drop policy if exists "Partners: platform admins can manage" on public.partners;

create policy "Partners: platform admins can manage"
  on public.partners
  for all
  to authenticated
  using (public.is_platform_admin ())
  with check (public.is_platform_admin ());

-- Update registration policies to allow referral_code only when it is valid.
drop policy if exists "Registrations: public can register" on public.registrations;

create policy "Registrations: public can register"
  on public.registrations
  for insert
  to anon, authenticated
  with check (
    public.is_webinar_open_for_registration (webinar_id)
    and (
      referral_code is null
      or public.is_active_partner_code (referral_code)
    )
  );

drop policy if exists "Registrations: account members or owner can update" on public.registrations;

create policy "Registrations: account members or owner can update"
  on public.registrations
  for update
  to authenticated
  using (
    (
      public.is_account_member ((select account_id from public.webinars where id = webinar_id))
      or user_id = auth.uid ()
      or email = (select email from public.profiles where id = auth.uid ())
      or public.is_platform_admin ()
    )
  )
  with check (
    (
      public.is_account_member ((select account_id from public.webinars where id = webinar_id))
      or user_id = auth.uid ()
      or email = (select email from public.profiles where id = auth.uid () )
      or public.is_platform_admin ()
    )
    and (
      referral_code is null
      or public.is_active_partner_code (referral_code)
    )
  );
