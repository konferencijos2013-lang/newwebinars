-- ---------------------------------------------------------------------
-- MVP core extensions
-- Sessions, capacity enforcement, reminders queue/logs, partner clicks,
-- additional registration fields, and RLS for new tables.
-- ---------------------------------------------------------------------

-- -----------------------------------------------------------------
-- 1. Webinar sessions (MVP: schedule layer, registrations stay on webinars)
-- -----------------------------------------------------------------

create type public.webinar_session_status as enum ('upcoming', 'live', 'ended', 'cancelled');

create table public.webinar_sessions (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.webinar_session_status not null default 'upcoming',
  capacity int check (capacity > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.webinar_sessions is 'Individual occurrences of a webinar. MVP registrations remain at the webinar level; sessions provide future multi-session support and public scheduling.';

create index idx_webinar_sessions_webinar_id on public.webinar_sessions (webinar_id);
create index idx_webinar_sessions_starts_at on public.webinar_sessions (starts_at);
create index idx_webinar_sessions_status on public.webinar_sessions (status);
create index idx_webinar_sessions_is_default on public.webinar_sessions (is_default);
create index idx_webinar_sessions_webinar_id_starts_at on public.webinar_sessions (webinar_id, starts_at);

-- -----------------------------------------------------------------
-- 2. Registration schema extensions
-- -----------------------------------------------------------------

alter table public.registrations
  add column phone text,
  add column company text,
  add column telegram_username text,
  add column utm_medium text,
  add column utm_campaign text,
  add column cancelled_at timestamptz;

comment on column public.registrations.cancelled_at is 'When the attendee cancelled. Partial unique index allows the same email to register again after cancellation.';

-- Backfill existing cancelled rows so capacity/unique logic works immediately.
update public.registrations
set cancelled_at = now ()
where status = 'cancelled' and cancelled_at is null;

-- Replace the unconditional unique constraint with a partial unique index.
alter table public.registrations drop constraint if exists registrations_webinar_id_email_key;
create unique index idx_registrations_active_email
  on public.registrations (webinar_id, email)
  where cancelled_at is null;

create index idx_registrations_webinar_id_cancelled_at
  on public.registrations (webinar_id, cancelled_at)
  where cancelled_at is null;

-- -----------------------------------------------------------------
-- 3. Concurrency-safe capacity enforcement
-- -----------------------------------------------------------------

create or replace function public.is_webinar_open_for_registration (webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_max int;
  v_count int;
  v_lock_key bigint;
begin
  -- Serialize capacity checks per webinar to prevent overselling under concurrency.
  v_lock_key := hashtextextended (webinar_id::text, 0);
  perform pg_advisory_xact_lock (v_lock_key);

  select w.status, w.max_participants into v_status, v_max
  from public.webinars w
  where w.id = webinar_id;

  if v_status not in ('published', 'live') then
    return false;
  end if;

  select count (*) into v_count
  from public.registrations r
  where r.webinar_id = webinar_id and r.cancelled_at is null;

  return v_max is null or v_count < v_max;
end;
$$;

comment on function public.is_webinar_open_for_registration (uuid) is 'True if the webinar is published/live and has remaining capacity. Uses a per-webinar advisory lock to keep the count check concurrency-safe.';

-- -----------------------------------------------------------------
-- 4. Reminder queue and logs
-- -----------------------------------------------------------------

create type public.reminder_status as enum ('queued', 'processing', 'sent', 'failed', 'cancelled');
create type public.reminder_log_status as enum ('sent', 'failed');

create table public.reminder_queue (
  id uuid primary key default gen_random_uuid (),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  rule_id uuid references public.reminder_rules (id) on delete set null,
  scheduled_at timestamptz not null,
  status public.reminder_status not null default 'queued',
  sent_at timestamptz,
  failed_at timestamptz,
  error_message text,
  retry_count int not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.reminder_queue is 'Pending reminder jobs. Populated by registration logic or Edge Functions; sent asynchronously.';
create index idx_reminder_queue_registration_id on public.reminder_queue (registration_id);
create index idx_reminder_queue_scheduled_at_status on public.reminder_queue (scheduled_at, status);
create index idx_reminder_queue_status_retry on public.reminder_queue (status, retry_count);

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid (),
  queue_id uuid not null references public.reminder_queue (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  rule_id uuid references public.reminder_rules (id) on delete set null,
  status public.reminder_log_status not null,
  provider_response text,
  sent_at timestamptz not null default now ()
);

comment on table public.reminder_logs is 'Sent/failed reminder audit trail.';
create index idx_reminder_logs_queue_id on public.reminder_logs (queue_id);
create index idx_reminder_logs_registration_id on public.reminder_logs (registration_id);
create index idx_reminder_logs_sent_at on public.reminder_logs (sent_at);

-- -----------------------------------------------------------------
-- 5. Partner clicks
-- -----------------------------------------------------------------

create table public.partner_clicks (
  id uuid primary key default gen_random_uuid (),
  partner_code text not null references public.partners (code) on delete cascade,
  clicked_at timestamptz not null default now (),
  ip_address text,
  user_agent text,
  referrer_url text,
  landing_path text,
  webinar_id uuid references public.webinars (id) on delete set null,
  converted_registration_id uuid references public.registrations (id) on delete set null,
  utm_source text,
  created_at timestamptz not null default now ()
);

comment on table public.partner_clicks is 'Flat affiliate click tracking. Attribution is authoritative through registrations.referral_code (first-touch); this table is analytics/audit.';

create index idx_partner_clicks_partner_code on public.partner_clicks (partner_code);
create index idx_partner_clicks_clicked_at on public.partner_clicks (clicked_at);
create index idx_partner_clicks_converted_registration_id on public.partner_clicks (converted_registration_id);
create index idx_partner_clicks_webinar_id on public.partner_clicks (webinar_id);

-- -----------------------------------------------------------------
-- 6. Role model extension: add editor
-- -----------------------------------------------------------------

alter table public.account_members
  drop constraint if exists account_members_role_check;

alter table public.account_members
  add constraint account_members_role_check
    check (role in ('owner', 'admin', 'editor', 'host', 'viewer'));

-- -----------------------------------------------------------------
-- 7. Helper: resolve registration -> account_id
-- -----------------------------------------------------------------

create or replace function public.get_registration_account_id (p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select w.account_id into v_account_id
  from public.registrations r
  join public.webinars w on w.id = r.webinar_id
  where r.id = p_registration_id;

  return v_account_id;
end;
$$;

comment on function public.get_registration_account_id (uuid) is 'Returns the owning account_id for a registration. SECURITY DEFINER to avoid recursive RLS in policies.';

alter function public.get_registration_account_id (uuid) owner to postgres;

-- -----------------------------------------------------------------
-- 8. Public view for published webinar sessions
-- -----------------------------------------------------------------

create or replace view public.published_webinar_sessions with (security_barrier = on) as
select
  s.id,
  s.webinar_id,
  s.title as session_title,
  s.starts_at,
  s.ends_at,
  s.status as session_status,
  s.capacity as session_capacity,
  s.is_default
from public.webinar_sessions s
join public.webinars w on w.id = s.webinar_id
where w.status in ('published', 'live', 'ended')
  and s.status in ('upcoming', 'live', 'ended');

comment on view public.published_webinar_sessions is 'Public-safe session schedule for published webinars. SECURITY DEFINER like published_webinars.';

alter view public.published_webinar_sessions owner to postgres;

grant select on public.published_webinar_sessions to anon, authenticated;

-- -----------------------------------------------------------------
-- 9. RLS enable and grants for new tables
-- -----------------------------------------------------------------

alter table public.webinar_sessions enable row level security;
alter table public.reminder_queue enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.partner_clicks enable row level security;

-- Authenticated needs CRUD on the new tables; policies enforce real access.
grant select, insert, update, delete on public.webinar_sessions to authenticated;
grant select, insert, update, delete on public.reminder_queue to authenticated;
grant select, insert, update, delete on public.reminder_logs to authenticated;
grant select, insert, update, delete on public.partner_clicks to authenticated;

-- -----------------------------------------------------------------
-- 10. RLS policies
-- -----------------------------------------------------------------

-- Webinar sessions: account members view; owner/admin/editor/host manage.

drop policy if exists "Webinar sessions: account members can view" on public.webinar_sessions;

create policy "Webinar sessions: account members can view"
  on public.webinar_sessions
  for select
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  );

drop policy if exists "Webinar sessions: editors can manage" on public.webinar_sessions;

create policy "Webinar sessions: editors can manage"
  on public.webinar_sessions
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

-- Reminder queue: account members with elevated roles manage.

drop policy if exists "Reminder queue: account members can manage" on public.reminder_queue;

create policy "Reminder queue: account members can manage"
  on public.reminder_queue
  for all
  to authenticated
  using (
    public.has_account_role (public.get_registration_account_id (registration_id), array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (public.get_registration_account_id (registration_id), array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  );

-- Reminder logs: account members with elevated roles view.

drop policy if exists "Reminder logs: account members can view" on public.reminder_logs;

create policy "Reminder logs: account members can view"
  on public.reminder_logs
  for select
  to authenticated
  using (
    public.has_account_role (public.get_registration_account_id (registration_id), array['owner', 'admin', 'editor', 'host'])
    or public.is_platform_admin ()
  );

-- Partner clicks: platform admin only for now. Partner portal RLS can be added later.

drop policy if exists "Partner clicks: platform admins can manage" on public.partner_clicks;

create policy "Partner clicks: platform admins can manage"
  on public.partner_clicks
  for all
  to authenticated
  using (public.is_platform_admin ())
  with check (public.is_platform_admin ());

-- -----------------------------------------------------------------
-- 11. Enqueue helper for reminder queue (definer, does not send email)
-- -----------------------------------------------------------------

create or replace function public.enqueue_reminders_for_registration (p_registration_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webinar_id uuid;
  v_scheduled_at timestamptz;
  v_count int := 0;
  r record;
begin
  select webinar_id into v_webinar_id
  from public.registrations
  where id = p_registration_id;

  if v_webinar_id is null then
    return 0;
  end if;

  for r in
    select id, minutes_before
    from public.reminder_rules
    where webinar_id = v_webinar_id and is_enabled = true
  loop
    select w.scheduled_at - make_interval (mins => r.minutes_before)
    into v_scheduled_at
    from public.webinars w
    where w.id = v_webinar_id;

    insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
    values (p_registration_id, r.id, v_scheduled_at)
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.enqueue_reminders_for_registration (uuid) is 'Creates reminder_queue rows for a registration based on active reminder_rules. SECURITY DEFINER to bypass RLS during enqueue. Does not send email.';

alter function public.enqueue_reminders_for_registration (uuid) owner to postgres;
