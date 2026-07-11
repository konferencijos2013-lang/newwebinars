-- -----------------------------------------------------------------
-- Webinar access modes and evergreen schedules
-- -----------------------------------------------------------------

-- Add access control columns to webinars.
alter table public.webinars
  add column access_mode text not null default 'public'
    check (access_mode in ('public', 'password_protected', 'paid_access', 'invited_only')),
  add column password_hash text,
  add column price_cents int check (price_cents >= 0);

comment on column public.webinars.access_mode is 'Access policy for the webinar: public, password_protected, paid_access, invited_only.';
comment on column public.webinars.password_hash is 'BCrypt hash of the room password; used when access_mode is password_protected.';
comment on column public.webinars.price_cents is 'Price to attend when access_mode is paid_access.';

-- Index for lookup by access mode.
create index idx_webinars_access_mode on public.webinars (access_mode);

-- -----------------------------------------------------------------
-- Evergreen / automated webinar schedules
-- -----------------------------------------------------------------

create type public.webinar_schedule_type as enum (
  'on_demand',
  'fixed',
  'recurring',
  'just_in_time'
);

create table public.webinar_schedules (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  schedule_type public.webinar_schedule_type not null,
  starts_at timestamptz,
  ends_at timestamptz,
  recurrence_rule text,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  check (
    (schedule_type = 'on_demand') = (starts_at is null)
  )
);

comment on table public.webinar_schedules is 'Scheduling rules for automated/evergreen webinars instances.';

create index idx_webinar_schedules_webinar_id on public.webinar_schedules (webinar_id);
create index idx_webinar_schedules_starts_at on public.webinar_schedules (starts_at);

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.webinar_schedules enable row level security;

grant select, insert, update, delete on public.webinar_schedules to authenticated;

drop policy if exists "Webinar schedules: account members can view" on public.webinar_schedules;

create policy "Webinar schedules: account members can view"
  on public.webinar_schedules
  for select
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  );

drop policy if exists "Webinar schedules: editors can manage" on public.webinar_schedules;

create policy "Webinar schedules: editors can manage"
  on public.webinar_schedules
  for all
  to authenticated
  using (
    public.has_account_role ((select account_id from public.webinars where id = webinar_id), array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role ((select account_id from public.webinars where id = webinar_id), array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  );
