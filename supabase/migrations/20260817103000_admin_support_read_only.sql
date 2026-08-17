-- Global platform administrators may inspect every account, but may not mutate
-- client-account data through the standard browser role. Support views stay
-- read-only even if an admin attempts a direct REST request.

create or replace function public.start_support_view(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted';
  end if;

  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'Account not found';
  end if;

  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, account_id)
  values (auth.uid(), 'support_view_started', 'account', p_account_id::text, p_account_id);
end;
$$;

alter function public.start_support_view(uuid) owner to postgres;
grant execute on function public.start_support_view(uuid) to authenticated;

-- Accounts and memberships: retain admin read access, remove privileged writes.
drop policy if exists "Accounts: authenticated users can create" on public.accounts;
drop policy if exists "Accounts: owner or admin can update" on public.accounts;
drop policy if exists "Accounts: owner or admin can delete" on public.accounts;
create policy "Accounts: authenticated users can create" on public.accounts for insert to authenticated
  with check (owner_id = auth.uid());
create policy "Accounts: owner or admin can update" on public.accounts for update to authenticated
  using (public.has_account_role(id, array['owner', 'admin']))
  with check (public.has_account_role(id, array['owner', 'admin']));
create policy "Accounts: owner or admin can delete" on public.accounts for delete to authenticated
  using (public.has_account_role(id, array['owner', 'admin']));

drop policy if exists "Account members: owner or admin can manage" on public.account_members;
drop policy if exists "Account members: owner or admin can update" on public.account_members;
drop policy if exists "Account members: owner or admin can delete" on public.account_members;
create policy "Account members: owner or admin can manage" on public.account_members for insert to authenticated
  with check (public.has_account_role(account_id, array['owner', 'admin']));
create policy "Account members: owner or admin can update" on public.account_members for update to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']))
  with check (public.has_account_role(account_id, array['owner', 'admin']));
create policy "Account members: owner or admin can delete" on public.account_members for delete to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']));

-- Core client content displayed in the support area.
drop policy if exists "Webinars: account members can create" on public.webinars;
drop policy if exists "Webinars: account members can update" on public.webinars;
drop policy if exists "Webinars: account members can delete" on public.webinars;
create policy "Webinars: account members can create" on public.webinars for insert to authenticated
  with check (public.has_account_role(account_id, array['owner', 'admin', 'host']));
create policy "Webinars: account members can update" on public.webinars for update to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin', 'host']))
  with check (public.has_account_role(account_id, array['owner', 'admin', 'host']));
create policy "Webinars: account members can delete" on public.webinars for delete to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin', 'host']));

drop policy if exists "Funnels: editors can manage" on public.funnels;
create policy "Funnels: editors can manage" on public.funnels for all to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin', 'editor', 'host']))
  with check (public.has_account_role(account_id, array['owner', 'admin', 'editor', 'host']));
drop policy if exists "Funnel pages: editors can manage" on public.funnel_pages;
create policy "Funnel pages: editors can manage" on public.funnel_pages for all to authenticated
  using (public.has_account_role((select account_id from public.funnels where id = funnel_id), array['owner', 'admin', 'editor', 'host']))
  with check (public.has_account_role((select account_id from public.funnels where id = funnel_id), array['owner', 'admin', 'editor', 'host']));
drop policy if exists "Funnel blocks: editors can manage" on public.funnel_blocks;
create policy "Funnel blocks: editors can manage" on public.funnel_blocks for all to authenticated
  using (public.has_account_role((select account_id from public.funnels where id = (select funnel_id from public.funnel_pages where id = page_id)), array['owner', 'admin', 'editor', 'host']))
  with check (public.has_account_role((select account_id from public.funnels where id = (select funnel_id from public.funnel_pages where id = page_id)), array['owner', 'admin', 'editor', 'host']));

drop policy if exists "Recordings: editors can manage" on public.recordings;
create policy "Recordings: editors can manage" on public.recordings for all to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin', 'editor', 'host']))
  with check (public.has_account_role(account_id, array['owner', 'admin', 'editor', 'host']));

-- Secrets and integrations are deliberately not part of support observation.
drop policy if exists "Integrations: owner or admin can insert" on public.integration_connections;
drop policy if exists "Integrations: owner or admin can update" on public.integration_connections;
drop policy if exists "Integrations: owner or admin can delete" on public.integration_connections;
create policy "Integrations: owner or admin can insert" on public.integration_connections for insert to authenticated
  with check (public.has_account_role(account_id, array['owner', 'admin']));
create policy "Integrations: owner or admin can update" on public.integration_connections for update to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']))
  with check (public.has_account_role(account_id, array['owner', 'admin']));
create policy "Integrations: owner or admin can delete" on public.integration_connections for delete to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']));
