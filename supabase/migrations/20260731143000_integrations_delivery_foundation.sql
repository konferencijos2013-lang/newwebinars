-- Account-level integrations and reliable delivery foundation.
-- Secrets never live in public tables; they are stored in Supabase Vault.

create type public.integration_provider as enum ('resend', 'manychat');
create type public.integration_status as enum ('active', 'disabled', 'error');

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider public.integration_provider not null,
  display_name text not null,
  status public.integration_status not null default 'active',
  config jsonb not null default '{}'::jsonb,
  vault_secret_id uuid not null,
  last_tested_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);

comment on table public.integration_connections is 'Per-account delivery providers. Public metadata only; credentials are held in Vault.';
create index integration_connections_account_id_idx on public.integration_connections(account_id);

alter table public.integration_connections enable row level security;
grant select, insert, update, delete on public.integration_connections to authenticated;

create policy "Integration connections: account admins can view"
  on public.integration_connections for select to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin());

create policy "Integration connections: account admins can create"
  on public.integration_connections for insert to authenticated
  with check (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin());

create policy "Integration connections: account admins can update"
  on public.integration_connections for update to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin())
  with check (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin());

create policy "Integration connections: account admins can delete"
  on public.integration_connections for delete to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin());

-- The API key is supplied only through this controlled RPC. It is created in
-- Vault and cannot be read by browser clients after saving.
create or replace function public.save_integration_connection(
  p_account_id uuid,
  p_provider public.integration_provider,
  p_display_name text,
  p_config jsonb,
  p_secret text
)
returns public.integration_connections
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_connection public.integration_connections;
  v_secret_id uuid;
begin
  if auth.uid() is null or not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized to manage account integrations';
  end if;

  if length(trim(coalesce(p_secret, ''))) < 8 then
    raise exception 'Integration credential is required';
  end if;

  select vault_secret_id into v_secret_id
  from public.integration_connections
  where account_id = p_account_id and provider = p_provider
  for update;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      format('integration:%s:%s', p_account_id, p_provider),
      format('Credential for %s integration', p_provider)
    ) into v_secret_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      format('integration:%s:%s', p_account_id, p_provider),
      format('Credential for %s integration', p_provider)
    );
  end if;

  insert into public.integration_connections (
    account_id, provider, display_name, config, vault_secret_id, status, created_by, last_error
  ) values (
    p_account_id, p_provider, trim(p_display_name), coalesce(p_config, '{}'::jsonb), v_secret_id,
    'active', auth.uid(), null
  )
  on conflict (account_id, provider) do update set
    display_name = excluded.display_name,
    config = excluded.config,
    vault_secret_id = excluded.vault_secret_id,
    status = 'active',
    last_error = null,
    updated_at = now()
  returning * into v_connection;

  return v_connection;
end;
$$;

-- Only service_role Edge Functions may retrieve a credential for a job.
create or replace function public.get_integration_secret(p_connection_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select s.decrypted_secret
  from public.integration_connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.id = p_connection_id
$$;

revoke all on function public.get_integration_secret(uuid) from public;
grant execute on function public.get_integration_secret(uuid) to service_role;

-- Bind reminder rules to an account provider. Existing rows continue to work
-- until a connection is selected, but no attempt is sent without one.
alter table public.reminder_rules
  add column integration_connection_id uuid references public.integration_connections(id) on delete set null;
create index reminder_rules_integration_connection_id_idx on public.reminder_rules(integration_connection_id);

-- Atomically claims due reminder rows so concurrent workers cannot send the
-- same message. It deliberately returns no credentials.
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (
  queue_id uuid,
  registration_id uuid,
  rule_id uuid,
  retry_count integer,
  email text,
  full_name text,
  webinar_title text,
  subject text,
  body text,
  connection_id uuid,
  provider public.integration_provider,
  provider_config jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select q.id
    from public.reminder_queue q
    join public.reminder_rules rr on rr.id = q.rule_id
    join public.integration_connections ic on ic.id = rr.integration_connection_id
      and ic.status = 'active'
    where q.status = 'queued'
      and q.scheduled_at <= now()
      and q.retry_count < 5
    order by q.scheduled_at, q.created_at
    for update of q skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.reminder_queue q
    set status = 'processing', updated_at = now()
    from due
    where q.id = due.id
    returning q.id, q.registration_id, q.rule_id, q.retry_count
  )
  select c.id, c.registration_id, c.rule_id, c.retry_count,
    r.email, r.full_name, w.title, rr.subject, rr.body,
    ic.id, ic.provider, ic.config
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.webinars w on w.id = r.webinar_id
  join public.reminder_rules rr on rr.id = c.rule_id
  join public.integration_connections ic on ic.id = rr.integration_connection_id;
end;
$$;

create or replace function public.complete_reminder_delivery(
  p_queue_id uuid,
  p_status public.reminder_log_status,
  p_provider_response text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.reminder_queue;
begin
  update public.reminder_queue
  set retry_count = case when p_status = 'failed' then retry_count + 1 else retry_count end,
      status = case
        when p_status = 'sent' then 'sent'::public.reminder_status
        when retry_count + 1 >= 5 then 'failed'::public.reminder_status
        else 'queued'::public.reminder_status
      end,
      sent_at = case when p_status = 'sent' then now() else null end,
      failed_at = case when p_status = 'failed' and retry_count + 1 >= 5 then now() else null end,
      error_message = p_error_message,
      updated_at = now()
  where id = p_queue_id and status = 'processing'
  returning * into v_queue;

  if v_queue.id is not null then
    insert into public.reminder_logs(queue_id, registration_id, rule_id, status, provider_response)
    values (v_queue.id, v_queue.registration_id, v_queue.rule_id, p_status, p_provider_response);
  end if;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public;
revoke all on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) from public;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) to service_role;

-- Registration is the single source of truth for scheduling reminders.
create or replace function public.register_for_webinar (
  p_webinar_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null,
  p_company text default null,
  p_referrer_url text default null,
  p_referral_code text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  if not public.is_webinar_open_for_registration(p_webinar_id) then
    raise exception 'Webinar is not open for registration';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then
    raise exception 'Invalid referral code';
  end if;

  insert into public.registrations (
    webinar_id, email, full_name, phone, company, referrer_url, referral_code, status
  ) values (
    p_webinar_id, p_email, p_full_name, p_phone, p_company, p_referrer_url, p_referral_code, 'registered'
  ) returning * into result;

  perform public.enqueue_reminders_for_registration(result.id);
  return result;
end;
$$;

alter function public.register_for_webinar(uuid, text, text, text, text, text, text) owner to postgres;
grant execute on function public.register_for_webinar(uuid, text, text, text, text, text, text) to anon, authenticated;
