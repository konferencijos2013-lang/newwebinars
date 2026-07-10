-- Initial schema for NewWebinars
-- Multi-user webinar SaaS MVP with lifecycle, delivery, chat, offers, and reminders.

-- Enable pgcrypto for gen_random_uuid(). Idempotent on Supabase.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Accounts and membership
-- ---------------------------------------------------------------------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid (),
  slug text not null unique,
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  -- Billing/limits tier. Not an authorization role.
  plan text not null default 'free' check (plan in ('free', 'paid', 'vip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounts is 'Top-level workspace/tenant for a webinar SaaS customer.';
comment on column public.accounts.plan is 'MVP product tier for limits and monetization. Stripe-specific billing state will live in dedicated billing tables later.';

create table if not exists public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'host' check (role in ('owner', 'admin', 'host', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

comment on table public.account_members is 'Many-to-many membership linking users to accounts with workspace roles.';

-- Auto-create the owner membership when an account is inserted.
create or replace function public.handle_new_account ()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.account_members (account_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists trg_handle_new_account on public.accounts;
create trigger trg_handle_new_account
after insert on public.accounts
for each row execute function public.handle_new_account ();

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  -- Global platform role. 'admin' is for internal platform staff only.
  role text not null default 'guest' check (role in ('guest', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App-level user profiles extending Supabase Auth.';

-- ---------------------------------------------------------------------
-- Webinars
-- ---------------------------------------------------------------------

create table if not exists public.webinars (
  id uuid primary key default gen_random_uuid (),
  account_id uuid not null references public.accounts (id) on delete cascade,
  presenter_id uuid references public.profiles (id) on delete set null,
  presenter_name text,
  slug text not null unique,
  title text not null,
  description text,
  type text not null default 'live' check (type in ('live', 'automated')),
  status text not null default 'draft' check (status in ('draft', 'published', 'live', 'ended', 'cancelled')),
  scheduled_at timestamptz,
  duration_minutes int check (duration_minutes > 0),
  max_participants int check (max_participants > 0),
  waiting_room_enabled boolean not null default true,
  early_entry_minutes int not null default 10 check (early_entry_minutes >= 0),
  meeting_url text,
  automated_video_url text,
  recording_url text,
  offer_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.webinars is 'Core webinar records owned by an account.';

-- ---------------------------------------------------------------------
-- Offers / CTAs shown during or after a webinar
-- ---------------------------------------------------------------------

create table if not exists public.webinar_offers (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  title text not null,
  description text,
  button_text text not null default 'Learn more',
  target_url text,
  display_at_seconds int default 0 check (display_at_seconds >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.webinar_offers is 'Sales CTAs/offers shown inside the webinar lifecycle.';

-- ---------------------------------------------------------------------
-- Registrations and attendee lifecycle
-- ---------------------------------------------------------------------

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  access_token uuid not null default gen_random_uuid () unique,
  email text not null,
  full_name text,
  status text not null default 'registered' check (status in ('registered', 'attended', 'cancelled', 'no_show')),
  registered_at timestamptz not null default now(),
  confirmed_at timestamptz,
  entered_waiting_room_at timestamptz,
  joined_webinar_at timestamptz,
  left_webinar_at timestamptz,
  watch_time_seconds int not null default 0 check (watch_time_seconds >= 0),
  saw_offer_at timestamptz,
  offer_clicked_at timestamptz,
  utm_source text,
  referrer_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (webinar_id, email)
);

comment on table public.registrations is 'Attendee registrations with full lifecycle progress tracking.';

-- ---------------------------------------------------------------------
-- Chat history
-- ---------------------------------------------------------------------

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_name text not null,
  message text not null,
  message_type text not null default 'chat' check (message_type in ('chat', 'system', 'offer')),
  sent_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Persisted chat messages for live and automated webinars.';

-- ---------------------------------------------------------------------
-- Reminder rules
-- ---------------------------------------------------------------------

create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  channel text not null check (channel in ('email', 'telegram')),
  minutes_before int not null check (minutes_before >= 0),
  subject text,
  body text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reminder_rules is 'Reminder configuration per webinar. Execution logs are deferred.';

-- ---------------------------------------------------------------------
-- Indexes for tenant safety and performance
-- ---------------------------------------------------------------------

create index if not exists idx_accounts_owner_id on public.accounts (owner_id);
create index if not exists idx_account_members_user_id on public.account_members (user_id);

create index if not exists idx_webinars_account_id on public.webinars (account_id);
create index if not exists idx_webinars_presenter_id on public.webinars (presenter_id);
create index if not exists idx_webinars_status on public.webinars (status);
create index if not exists idx_webinars_scheduled_at on public.webinars (scheduled_at);

create index if not exists idx_webinar_offers_webinar_id on public.webinar_offers (webinar_id);

create index if not exists idx_registrations_webinar_id on public.registrations (webinar_id);
create index if not exists idx_registrations_user_id on public.registrations (user_id);
create index if not exists idx_registrations_email on public.registrations (email);

create index if not exists idx_chat_messages_webinar_id_sent_at on public.chat_messages (webinar_id, sent_at);
create index if not exists idx_chat_messages_sender_id on public.chat_messages (sender_id);

create index if not exists idx_reminder_rules_webinar_id on public.reminder_rules (webinar_id);

-- ---------------------------------------------------------------------
-- Public view for published webinars
-- INTENTIONALLY SECURITY DEFINER. This view is a public read model for
-- anonymous and authenticated users. SECURITY INVOKER would force callers
-- through base-table RLS; anon has no direct select access on webinars,
-- so they would see zero rows. The restricted column list and explicit
-- status filter below are the security boundary. Any future changes to
-- this view must be security-reviewed.
-- ---------------------------------------------------------------------

create or replace view public.published_webinars with (security_barrier = on) as
select
  w.id,
  w.slug,
  w.account_id,
  a.name as account_name,
  a.slug as account_slug,
  w.presenter_name,
  w.title,
  w.description,
  w.type,
  w.status,
  w.scheduled_at,
  w.duration_minutes,
  w.max_participants,
  w.waiting_room_enabled,
  w.early_entry_minutes,
  w.created_at
from public.webinars w
join public.accounts a on w.account_id = a.id
where w.status in ('published', 'live', 'ended');

comment on view public.published_webinars is 'Public-safe webinar listing for landing and waiting-room pages.';

-- Force SECURITY DEFINER behaviour: the view owner (postgres) bypasses RLS,
-- so the column list and status filter below become the authoritative boundary.
-- Without this, the view would inherit the caller's RLS and anon would see no rows.
alter view public.published_webinars owner to postgres;

grant select on public.published_webinars to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.profiles enable row level security;
alter table public.webinars enable row level security;
alter table public.webinar_offers enable row level security;
alter table public.registrations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reminder_rules enable row level security;

-- API role grants. Policies enforce the actual access rules.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.published_webinars to anon, authenticated;
grant select on public.webinar_offers to anon;
grant insert on public.registrations to anon;

-- Helpers (inline subqueries keep policies auditable without extra functions)
-- Platform admin predicate
-- exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')

-- Accounts

drop policy if exists "Accounts: members can view own account" on public.accounts;

create policy "Accounts: members can view own account"
  on public.accounts
  for select
  to authenticated
  using (
    id in (select account_id from public.account_members where user_id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Accounts: authenticated users can create" on public.accounts;

create policy "Accounts: authenticated users can create"
  on public.accounts
  for insert
  to authenticated
  with check (
    owner_id = auth.uid ()
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Accounts: owner or admin can update" on public.accounts;

create policy "Accounts: owner or admin can update"
  on public.accounts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.account_members
      where account_id = id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.account_members
      where account_id = id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Accounts: owner or admin can delete" on public.accounts;

create policy "Accounts: owner or admin can delete"
  on public.accounts
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.account_members
      where account_id = id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

-- Account members

drop policy if exists "Account members: members can view other members of same account" on public.account_members;

create policy "Account members: members can view other members of same account"
  on public.account_members
  for select
  to authenticated
  using (
    account_id in (select account_id from public.account_members where user_id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Account members: owner or admin can manage" on public.account_members;

create policy "Account members: owner or admin can manage"
  on public.account_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.account_members
      where account_id = account_id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Account members: owner or admin can update" on public.account_members;

create policy "Account members: owner or admin can update"
  on public.account_members
  for update
  to authenticated
  using (
    exists (
      select 1 from public.account_members
      where account_id = account_id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.account_members
      where account_id = account_id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Account members: owner or admin can delete" on public.account_members;

create policy "Account members: owner or admin can delete"
  on public.account_members
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.account_members
      where account_id = account_id and user_id = auth.uid () and role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

-- Profiles
-- Email and platform role are never exposed to other users. Own row + platform admin only.

drop policy if exists "Profiles: own or platform admin can view" on public.profiles;

create policy "Profiles: own or platform admin can view"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid () = id
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Profiles: own can update" on public.profiles;

create policy "Profiles: own can update"
  on public.profiles
  for update
  to authenticated
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- Webinars
-- Account members see full rows (including private delivery links) for their account.
-- Anonymous/public attendees use the published_webinars view.

drop policy if exists "Webinars: account members can view account webinars" on public.webinars;

create policy "Webinars: account members can view account webinars"
  on public.webinars
  for select
  to authenticated
  using (
    account_id in (select account_id from public.account_members where user_id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Webinars: account members can create" on public.webinars;

create policy "Webinars: account members can create"
  on public.webinars
  for insert
  to authenticated
  with check (
    account_id in (
      select account_id from public.account_members
      where user_id = auth.uid () and role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Webinars: account members can update" on public.webinars;

create policy "Webinars: account members can update"
  on public.webinars
  for update
  to authenticated
  using (
    account_id in (
      select account_id from public.account_members
      where user_id = auth.uid () and role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    account_id in (
      select account_id from public.account_members
      where user_id = auth.uid () and role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Webinars: account members can delete" on public.webinars;

create policy "Webinars: account members can delete"
  on public.webinars
  for delete
  to authenticated
  using (
    account_id in (
      select account_id from public.account_members
      where user_id = auth.uid () and role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

-- Webinar offers
-- Active offers for published webinars are readable by the public.

drop policy if exists "Webinar offers: account members can manage" on public.webinar_offers;

create policy "Webinar offers: account members can manage"
  on public.webinar_offers
  for all
  to authenticated
  using (
    webinar_id in (
      select id from public.webinars
      where account_id in (
        select account_id from public.account_members
        where user_id = auth.uid () and role in ('owner', 'admin', 'host')
      )
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    webinar_id in (
      select id from public.webinars
      where account_id in (
        select account_id from public.account_members
        where user_id = auth.uid () and role in ('owner', 'admin', 'host')
      )
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Webinar offers: public view active" on public.webinar_offers;
drop policy if exists "Webinar offers: public can view active offers for published web" on public.webinar_offers;

create policy "Webinar offers: public view active"
  on public.webinar_offers
  for select
  to anon, authenticated
  using (
    active
    and exists (
      select 1 from public.webinars
      where id = webinar_id and status in ('published', 'live', 'ended')
    )
  );

-- Registrations
-- Account members see all registrations for their webinars.
-- Authenticated attendees see their own registrations (by user_id or profile email).
-- Public users can register for published/live webinars.

drop policy if exists "Registrations: account members can view webinar registrations" on public.registrations;

create policy "Registrations: account members can view webinar registrations"
  on public.registrations
  for select
  to authenticated
  using (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Registrations: public can register for published/live webinars" on public.registrations;

create policy "Registrations: public can register for published/live webinars"
  on public.registrations
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.webinars
      where id = webinar_id and status in ('published', 'live')
    )
  );

drop policy if exists "Registrations: account members can update" on public.registrations;

create policy "Registrations: account members can update"
  on public.registrations
  for update
  to authenticated
  using (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Registrations: account members can delete" on public.registrations;

create policy "Registrations: account members can delete"
  on public.registrations
  for delete
  to authenticated
  using (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

-- Chat messages
-- Account members see all chat for their webinars.
-- Authenticated attendees see chat for webinars they registered for.
-- Public attendees use an API/edge route for MVP room access.

drop policy if exists "Chat messages: account members can manage" on public.chat_messages;

create policy "Chat messages: account members can manage"
  on public.chat_messages
  for all
  to authenticated
  using (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid ()
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );

drop policy if exists "Chat messages: registered attendees can view" on public.chat_messages;

create policy "Chat messages: registered attendees can view"
  on public.chat_messages
  for select
  to authenticated
  using (
    webinar_id in (
      select webinar_id from public.registrations
      where user_id = auth.uid () or email = (select email from public.profiles where id = auth.uid ())
    )
  );

-- Reminder rules
-- Account members with owner/admin/host roles can manage.

drop policy if exists "Reminder rules: account members can manage" on public.reminder_rules;

create policy "Reminder rules: account members can manage"
  on public.reminder_rules
  for all
  to authenticated
  using (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid () and m.role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  )
  with check (
    webinar_id in (
      select w.id from public.webinars w
      join public.account_members m on w.account_id = m.account_id
      where m.user_id = auth.uid () and m.role in ('owner', 'admin', 'host')
    )
    or exists (
      select 1 from public.profiles where id = auth.uid () and role = 'admin'
    )
  );
