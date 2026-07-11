-- -----------------------------------------------------------------
-- Funnels, funnel pages, and funnel blocks
-- -----------------------------------------------------------------

create type public.funnel_step_type as enum (
  'registration',
  'waiting_room',
  'webinar_room',
  'offer',
  'order_form',
  'thank_you',
  'lead_magnet'
);

create table public.funnels (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  webinar_id uuid references public.webinars (id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (account_id, slug)
);

comment on table public.funnels is 'Webinar funnels owned by an account.';
comment on column public.funnels.webinar_id is 'Optional target webinar for this funnel.';
comment on column public.funnels.is_default is 'True if this is the account default funnel (e.g. for a webinar fallback).';

create table public.funnel_pages (
  id uuid primary key default gen_random_uuid (),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  name text not null,
  step_type public.funnel_step_type not null,
  path text not null,
  is_default boolean not null default false,
  theme jsonb,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (funnel_id, path)
);

comment on table public.funnel_pages is 'Pages inside a funnel (e.g. registration, offer, thanks).';

create table public.funnel_blocks (
  id uuid primary key default gen_random_uuid (),
  page_id uuid not null references public.funnel_pages (id) on delete cascade,
  block_type text not null,
  sort_order int not null default 0,
  content jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.funnel_blocks is 'Content blocks rendered on a funnel page.';

create index idx_funnels_account_id on public.funnels (account_id);
create index idx_funnels_webinar_id on public.funnels (webinar_id);
create index idx_funnel_pages_funnel_id on public.funnel_pages (funnel_id);
create index idx_funnel_pages_step_type on public.funnel_pages (step_type);
create index idx_funnel_blocks_page_id on public.funnel_blocks (page_id);
create index idx_funnel_blocks_sort_order on public.funnel_blocks (page_id, sort_order);

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.funnels enable row level security;
alter table public.funnel_pages enable row level security;
alter table public.funnel_blocks enable row level security;

grant select, insert, update, delete on public.funnels to authenticated;
grant select, insert, update, delete on public.funnel_pages to authenticated;
grant select, insert, update, delete on public.funnel_blocks to authenticated;

drop policy if exists "Funnels: account members can view" on public.funnels;
create policy "Funnels: account members can view"
  on public.funnels
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Funnels: editors can manage" on public.funnels;
create policy "Funnels: editors can manage"
  on public.funnels
  for all
  to authenticated
  using (
    public.has_account_role (account_id, array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (account_id, array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  );

drop policy if exists "Funnel pages: account members can view" on public.funnel_pages;
create policy "Funnel pages: account members can view"
  on public.funnel_pages
  for select
  to authenticated
  using (
    public.is_account_member ((select account_id from public.funnels where id = funnel_id))
    or public.is_platform_admin ()
  );

drop policy if exists "Funnel pages: editors can manage" on public.funnel_pages;
create policy "Funnel pages: editors can manage"
  on public.funnel_pages
  for all
  to authenticated
  using (
    public.has_account_role (
      (select account_id from public.funnels where id = funnel_id),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (
      (select account_id from public.funnels where id = funnel_id),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  );

drop policy if exists "Funnel blocks: account members can view" on public.funnel_blocks;
create policy "Funnel blocks: account members can view"
  on public.funnel_blocks
  for select
  to authenticated
  using (
    public.is_account_member (
      (
        select account_id
        from public.funnels
        where id = (select funnel_id from public.funnel_pages where id = page_id)
      )
    )
    or public.is_platform_admin ()
  );

drop policy if exists "Funnel blocks: editors can manage" on public.funnel_blocks;
create policy "Funnel blocks: editors can manage"
  on public.funnel_blocks
  for all
  to authenticated
  using (
    public.has_account_role (
      (
        select account_id
        from public.funnels
        where id = (select funnel_id from public.funnel_pages where id = page_id)
      ),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (
      (
        select account_id
        from public.funnels
        where id = (select funnel_id from public.funnel_pages where id = page_id)
      ),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  );
