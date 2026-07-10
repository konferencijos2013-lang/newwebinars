-- Replace account_members subqueries in RLS policies with security-definer helpers.
-- The old policies selected from public.account_members directly, which triggered
-- infinite recursion because account_members itself had an RLS policy reading
-- account_members.

-- ---------------------------------------------------------------------
-- Security-definer helpers
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin ()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles where id = auth.uid () and role = 'admin'
  );
end;
$$;

comment on function public.is_platform_admin () is 'True if the caller is a global platform admin. SECURITY DEFINER, bypasses RLS.';

alter function public.is_platform_admin () owner to postgres;

create or replace function public.is_account_member (p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.account_members
    where account_id = p_account_id and user_id = auth.uid ()
  );
end;
$$;

comment on function public.is_account_member (uuid) is 'True if the caller belongs to the given account. SECURITY DEFINER, bypasses RLS on account_members.';

alter function public.is_account_member (uuid) owner to postgres;

create or replace function public.has_account_role (p_account_id uuid, p_roles text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.account_members
    where account_id = p_account_id and user_id = auth.uid () and role = any (p_roles)
  );
end;
$$;

comment on function public.has_account_role (uuid, text[]) is 'True if the caller belongs to the given account with one of the given roles. SECURITY DEFINER, bypasses RLS on account_members.';

alter function public.has_account_role (uuid, text[]) owner to postgres;

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------

drop policy if exists "Accounts: members can view own account" on public.accounts;
drop policy if exists "Accounts: authenticated users can create" on public.accounts;
drop policy if exists "Accounts: owner or admin can update" on public.accounts;
drop policy if exists "Accounts: owner or admin can delete" on public.accounts;

create policy "Accounts: members can view own account"
  on public.accounts
  for select
  to authenticated
  using (public.is_account_member (id) or public.is_platform_admin ());

create policy "Accounts: authenticated users can create"
  on public.accounts
  for insert
  to authenticated
  with check (owner_id = auth.uid () or public.is_platform_admin ());

create policy "Accounts: owner or admin can update"
  on public.accounts
  for update
  to authenticated
  using (public.has_account_role (id, array['owner', 'admin']) or public.is_platform_admin ())
  with check (public.has_account_role (id, array['owner', 'admin']) or public.is_platform_admin ());

create policy "Accounts: owner or admin can delete"
  on public.accounts
  for delete
  to authenticated
  using (public.has_account_role (id, array['owner', 'admin']) or public.is_platform_admin ());

-- ---------------------------------------------------------------------
-- Account members
-- ---------------------------------------------------------------------

drop policy if exists "Account members: members can view other members of same account" on public.account_members;
drop policy if exists "Account members: members can view same account" on public.account_members;
drop policy if exists "Account members: owner or admin can manage" on public.account_members;
drop policy if exists "Account members: owner or admin can update" on public.account_members;
drop policy if exists "Account members: owner or admin can delete" on public.account_members;

create policy "Account members: members can view same account"
  on public.account_members
  for select
  to authenticated
  using (
    public.is_account_member (account_id)
    or user_id = auth.uid ()
    or public.is_platform_admin ()
  );

create policy "Account members: owner or admin can manage"
  on public.account_members
  for insert
  to authenticated
  with check (
    public.has_account_role (account_id, array['owner', 'admin'])
    or public.is_platform_admin ()
  );

create policy "Account members: owner or admin can update"
  on public.account_members
  for update
  to authenticated
  using (
    public.has_account_role (account_id, array['owner', 'admin'])
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (account_id, array['owner', 'admin'])
    or public.is_platform_admin ()
  );

create policy "Account members: owner or admin can delete"
  on public.account_members
  for delete
  to authenticated
  using (
    public.has_account_role (account_id, array['owner', 'admin'])
    or public.is_platform_admin ()
  );

-- ---------------------------------------------------------------------
-- Webinars
-- ---------------------------------------------------------------------

drop policy if exists "Webinars: account members can view account webinars" on public.webinars;
drop policy if exists "Webinars: account members can view" on public.webinars;
drop policy if exists "Webinars: account members can create" on public.webinars;
drop policy if exists "Webinars: account members can update" on public.webinars;
drop policy if exists "Webinars: account members can delete" on public.webinars;

create policy "Webinars: account members can view"
  on public.webinars
  for select
  to authenticated
  using (public.is_account_member (account_id) or public.is_platform_admin ());

create policy "Webinars: account members can create"
  on public.webinars
  for insert
  to authenticated
  with check (
    public.has_account_role (account_id, array['owner', 'admin', 'host'])
    or public.is_platform_admin ()
  );

create policy "Webinars: account members can update"
  on public.webinars
  for update
  to authenticated
  using (
    public.has_account_role (account_id, array['owner', 'admin', 'host'])
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (account_id, array['owner', 'admin', 'host'])
    or public.is_platform_admin ()
  );

create policy "Webinars: account members can delete"
  on public.webinars
  for delete
  to authenticated
  using (
    public.has_account_role (account_id, array['owner', 'admin', 'host'])
    or public.is_platform_admin ()
  );

-- ---------------------------------------------------------------------
-- Webinar offers
-- ---------------------------------------------------------------------

drop policy if exists "Webinar offers: account members can manage" on public.webinar_offers;
drop policy if exists "Webinar offers: public view active" on public.webinar_offers;

create policy "Webinar offers: account members can manage"
  on public.webinar_offers
  for all
  to authenticated
  using (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'host']
    )
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'host']
    )
    or public.is_platform_admin ()
  );

create policy "Webinar offers: public view active"
  on public.webinar_offers
  for select
  to anon, authenticated
  using (active and public.is_webinar_public (webinar_id));

-- ---------------------------------------------------------------------
-- Registrations
-- ---------------------------------------------------------------------

drop policy if exists "Registrations: account members can view webinar registrations" on public.registrations;
drop policy if exists "Registrations: account members can view" on public.registrations;
drop policy if exists "Registrations: public can register for published/live webinars" on public.registrations;
drop policy if exists "Registrations: public can register" on public.registrations;
drop policy if exists "Registrations: account members can update" on public.registrations;
drop policy if exists "Registrations: account members or owner can update" on public.registrations;
drop policy if exists "Registrations: account members can delete" on public.registrations;

create policy "Registrations: account members can view"
  on public.registrations
  for select
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or public.is_platform_admin ()
  );

create policy "Registrations: public can register"
  on public.registrations
  for insert
  to anon, authenticated
  with check (public.is_webinar_open_for_registration (webinar_id));

create policy "Registrations: account members or owner can update"
  on public.registrations
  for update
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or public.is_platform_admin ()
  )
  with check (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or user_id = auth.uid ()
    or email = (select email from public.profiles where id = auth.uid ())
    or public.is_platform_admin ()
  );

create policy "Registrations: account members can delete"
  on public.registrations
  for delete
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  );

-- ---------------------------------------------------------------------
-- Chat messages
-- ---------------------------------------------------------------------

drop policy if exists "Chat messages: account members can manage" on public.chat_messages;
drop policy if exists "Chat messages: registered attendees can view" on public.chat_messages;

create policy "Chat messages: account members can manage"
  on public.chat_messages
  for all
  to authenticated
  using (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  )
  with check (
    public.is_account_member ((select account_id from public.webinars where id = webinar_id))
    or public.is_platform_admin ()
  );

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

-- ---------------------------------------------------------------------
-- Reminder rules
-- ---------------------------------------------------------------------

drop policy if exists "Reminder rules: account members can manage" on public.reminder_rules;

create policy "Reminder rules: account members can manage"
  on public.reminder_rules
  for all
  to authenticated
  using (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'host']
    )
    or public.is_platform_admin ()
  )
  with check (
    public.has_account_role (
      (select account_id from public.webinars where id = webinar_id),
      array['owner', 'admin', 'host']
    )
    or public.is_platform_admin ()
  );
