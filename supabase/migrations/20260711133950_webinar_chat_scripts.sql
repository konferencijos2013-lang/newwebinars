-- -----------------------------------------------------------------
-- Simulated chat scripts for automated/evergreen webinars
-- -----------------------------------------------------------------

create type public.chat_script_sender_role as enum ('attendee', 'host');

create table public.webinar_chat_scripts (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  trigger_seconds int not null,
  display_name text not null,
  sender_role public.chat_script_sender_role not null default 'attendee',
  message text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  check (trigger_seconds >= 0)
);

create index idx_webinar_chat_scripts_webinar_id on public.webinar_chat_scripts (webinar_id, trigger_seconds);

-- Update chat_messages to allow anonymous sender registration access.
alter table public.chat_messages
  add column if not exists registration_id uuid null references public.registrations (id) on delete set null;

create index if not exists idx_chat_messages_registration_id on public.chat_messages (registration_id);

-- Add access fields to registrations for waiting/room entry state tracking.
alter table public.registrations
  add column if not exists entered_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists attended_seconds int not null default 0,
  add column if not exists saw_offer_at timestamptz,
  add column if not exists offer_clicked_at timestamptz;

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.webinar_chat_scripts enable row level security;

grant select, insert, update, delete on public.webinar_chat_scripts to authenticated;

drop policy if exists "Webinar chat scripts: account members can view" on public.webinar_chat_scripts;
create policy "Webinar chat scripts: account members can view"
  on public.webinar_chat_scripts
  for select
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  );

drop policy if exists "Webinar chat scripts: editors can manage" on public.webinar_chat_scripts;
create policy "Webinar chat scripts: editors can manage"
  on public.webinar_chat_scripts
  for all
  to authenticated
  using (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'editor', 'host']
    )
    or public.is_platform_admin ()
  );

-- Allow public registration holders to post chat messages in webinar rooms.
drop policy if exists "Chat messages: registrants can insert" on public.chat_messages;
create policy "Chat messages: registrants can insert"
  on public.chat_messages
  for insert
  to anon, authenticated
  with check (
    registration_id is not null
    and public.get_registration_account_id(registration_id) is not null
  );

drop policy if exists "Chat messages: webinar participants can view" on public.chat_messages;
create policy "Chat messages: webinar participants can view"
  on public.chat_messages
  for select
  to anon, authenticated
  using (true);
