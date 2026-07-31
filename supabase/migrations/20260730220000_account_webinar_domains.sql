-- Branded public webinar links per account.
-- Webinars remain short paths (/verslo-augimas); a hostname identifies the account.
alter table public.accounts
  add column if not exists public_subdomain text,
  add column if not exists custom_domain text,
  add column if not exists custom_domain_status text not null default 'not_configured'
    check (custom_domain_status in ('not_configured', 'pending_dns', 'verified'));

create unique index if not exists accounts_public_subdomain_unique
  on public.accounts (lower(public_subdomain))
  where public_subdomain is not null;

create unique index if not exists accounts_custom_domain_unique
  on public.accounts (lower(custom_domain))
  where custom_domain is not null;

alter table public.accounts
  add constraint accounts_public_subdomain_format
  check (public_subdomain is null or public_subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$');

alter table public.accounts
  add constraint accounts_custom_domain_format
  check (custom_domain is null or custom_domain ~ '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$');

comment on column public.accounts.public_subdomain is 'Managed hostname label, rendered as <label>.newwebinars.com.';
comment on column public.accounts.custom_domain is 'Customer-owned CNAME hostname, such as webinar.example.com.';
comment on column public.accounts.custom_domain_status is 'DNS connection workflow state.';


-- Resolve a short path against the account owning the incoming hostname.
create or replace function public.get_published_webinar_by_hostname(
  p_hostname text,
  p_slug text
)
returns setof public.published_webinars
language sql
stable
security definer
set search_path = public
as $$
  select pw.*
  from public.published_webinars pw
  join public.accounts a on a.id = pw.account_id
  where pw.slug = lower(p_slug)
    and (
      lower(a.public_subdomain || '.newwebinars.com') = lower(p_hostname)
      or (
        a.custom_domain_status = 'verified'
        and lower(a.custom_domain) = lower(p_hostname)
      )
    )
$$;

grant execute on function public.get_published_webinar_by_hostname(text, text)
  to anon, authenticated;
