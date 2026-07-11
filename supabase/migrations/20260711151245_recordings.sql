-- -----------------------------------------------------------------
-- Recordings library and storage quota tracking
-- -----------------------------------------------------------------

create type public.recording_status as enum (
  'processing',
  'ready',
  'archived',
  'deleted'
);

create table public.recordings (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  webinar_id uuid references public.webinars (id) on delete set null,
  session_id uuid references public.webinar_sessions (id) on delete set null,
  title text not null,
  description text,
  storage_path text not null unique,
  status public.recording_status not null default 'processing',
  duration_seconds int,
  size_bytes bigint not null default 0,
  recording_url text,
  thumbnail_url text,
  is_public boolean not null default false,
  metadata jsonb default '{}',
  recorded_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index idx_recordings_account_id on public.recordings (account_id);
create index idx_recordings_webinar_id on public.recordings (webinar_id);
create index idx_recordings_status on public.recordings (status);
create index idx_recordings_created_at on public.recordings (created_at desc);

comment on table public.recordings is 'Webinar recordings owned by an account.';

create table public.account_storage_usage (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  total_bytes bigint not null default 0,
  quota_bytes bigint not null default 0,
  recordings_count int not null default 0,
  updated_at timestamptz not null default now ()
);

comment on table public.account_storage_usage is 'Aggregated storage usage per account.';

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.recordings enable row level security;
alter table public.account_storage_usage enable row level security;

grant select, insert, update, delete on public.recordings to authenticated;
grant select, insert, update on public.account_storage_usage to authenticated;

drop policy if exists "Recordings: account members can view" on public.recordings;
create policy "Recordings: account members can view"
  on public.recordings
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

drop policy if exists "Recordings: editors can manage" on public.recordings;
create policy "Recordings: editors can manage"
  on public.recordings
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

drop policy if exists "Storage usage: account members can view" on public.account_storage_usage;
create policy "Storage usage: account members can view"
  on public.account_storage_usage
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

-- Function to refresh account storage totals.
drop function if exists public.refresh_account_storage_usage(uuid);
create or replace function public.refresh_account_storage_usage(p_account_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.account_storage_usage
  set
    total_bytes = coalesce((
      select sum(size_bytes)
      from public.recordings
      where account_id = p_account_id and status != 'deleted'
    ), 0),
    recordings_count = coalesce((
      select count(*)
      from public.recordings
      where account_id = p_account_id and status != 'deleted'
    ), 0),
    updated_at = now()
  where account_id = p_account_id;
end;
$$;
