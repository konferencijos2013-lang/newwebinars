-- One email address per account, collected from webinar registrations
-- or imported. Mass mail uses the connected transactional provider.
-- Webinar reminders stay on their own queue.

create table public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'unsubscribed')),
  source text not null default 'registration'
    check (source in ('registration', 'import')),
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, email),
  unique (unsubscribe_token),
  check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create index email_contacts_account_status_idx
  on public.email_contacts (account_id, status, last_seen_at desc);

alter table public.email_contacts enable row level security;
grant select on public.email_contacts to authenticated;
create policy "Email contacts: account admins can view"
  on public.email_contacts for select to authenticated
  using (
    public.has_account_role(account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );

create table public.email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed')),
  recipient_count integer not null check (recipient_count >= 1),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  request_key uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id, request_key),
  check (sent_count + failed_count + blocked_count <= recipient_count)
);

create unique index email_broadcasts_one_active_per_account_idx
  on public.email_broadcasts (account_id)
  where status in ('queued', 'processing');

alter table public.email_broadcasts enable row level security;
grant select on public.email_broadcasts to authenticated;
create policy "Email broadcasts: account admins can view"
  on public.email_broadcasts for select to authenticated
  using (
    public.has_account_role(account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );

create table public.email_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.email_broadcasts(id) on delete cascade,
  email_contact_id uuid references public.email_contacts(id) on delete set null,
  email text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed', 'blocked')),
  claim_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, email)
);

create index email_broadcast_recipients_claim_idx
  on public.email_broadcast_recipients (broadcast_id, status, created_at);

alter table public.email_broadcast_recipients enable row level security;

create or replace function public.email_contacts_preserve_opt_out()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.status in ('blocked', 'unsubscribed')
     and new.status is distinct from old.status
     and current_setting('app.email_allow_status_change', true) is distinct from '1' then
    new.status := old.status;
    new.unsubscribed_at := old.unsubscribed_at;
  end if;
  return new;
end;
$$;

create trigger email_contacts_preserve_opt_out
  before update on public.email_contacts
  for each row execute function public.email_contacts_preserve_opt_out();

create or replace function public.sync_email_contact_from_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return new;
  end if;
  select account_id into v_account_id from public.webinars where id = new.webinar_id;
  if v_account_id is null then
    return new;
  end if;
  insert into public.email_contacts (account_id, email, full_name, source, last_seen_at)
  values (
    v_account_id, v_email, nullif(trim(coalesce(new.full_name, '')), ''),
    'registration', now()
  )
  on conflict (account_id, email) do update set
    full_name = coalesce(email_contacts.full_name, excluded.full_name),
    last_seen_at = now(),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists registrations_sync_email_contact on public.registrations;
create trigger registrations_sync_email_contact
  after insert or update of email, full_name on public.registrations
  for each row execute function public.sync_email_contact_from_registration();

insert into public.email_contacts (account_id, email, full_name, source, last_seen_at)
select distinct on (w.account_id, lower(trim(r.email)))
  w.account_id,
  lower(trim(r.email)),
  nullif(trim(r.full_name), ''),
  'registration',
  r.registered_at
from public.registrations r
join public.webinars w on w.id = r.webinar_id
where r.cancelled_at is null
  and r.email is not null
  and lower(trim(r.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
order by w.account_id, lower(trim(r.email)), r.registered_at desc
on conflict (account_id, email) do nothing;

create or replace function public.set_email_contact_status(
  p_contact_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.email_contacts;
begin
  if p_status not in ('active', 'blocked') then
    raise exception 'Invalid status';
  end if;
  select * into v_contact from public.email_contacts where id = p_contact_id;
  if v_contact.id is null then
    raise exception 'Contact not found';
  end if;
  if not (
    public.has_account_role(v_contact.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  perform set_config('app.email_allow_status_change', '1', true);
  update public.email_contacts
  set status = p_status,
      unsubscribed_at = case when p_status = 'active' then null else unsubscribed_at end,
      updated_at = now()
  where id = p_contact_id;
end;
$$;

revoke all on function public.set_email_contact_status(uuid, text) from public;
grant execute on function public.set_email_contact_status(uuid, text) to authenticated;

create or replace function public.delete_email_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.email_contacts;
begin
  select * into v_contact from public.email_contacts where id = p_contact_id;
  if v_contact.id is null then
    raise exception 'Contact not found';
  end if;
  if not (
    public.has_account_role(v_contact.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  delete from public.email_contacts where id = p_contact_id;
end;
$$;

revoke all on function public.delete_email_contact(uuid) from public;
grant execute on function public.delete_email_contact(uuid) to authenticated;

create or replace function public.import_email_contacts(
  p_account_id uuid,
  p_rows jsonb
)
returns table (inserted_count integer, updated_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_email text;
  v_existed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_seen integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import between 1 and 1000 contacts';
  end if;
  if not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_seen := v_seen + 1;
    v_email := lower(left(trim(coalesce(v_row ->> 'email', '')), 320));
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select exists (
      select 1 from public.email_contacts
      where account_id = p_account_id and email = v_email
    ) into v_existed;
    insert into public.email_contacts (account_id, email, full_name, source)
    values (
      p_account_id,
      v_email,
      nullif(left(trim(coalesce(v_row ->> 'full_name', '')), 120), ''),
      'import'
    )
    on conflict (account_id, email) do update set
      full_name = coalesce(excluded.full_name, email_contacts.full_name),
      updated_at = now();
    if v_existed then v_updated := v_updated + 1; else v_inserted := v_inserted + 1; end if;
  end loop;

  if v_seen = 0 then
    raise exception 'Import between 1 and 1000 contacts';
  end if;
  return query select v_inserted, v_updated, v_skipped;
end;
$$;

revoke all on function public.import_email_contacts(uuid, jsonb) from public;
grant execute on function public.import_email_contacts(uuid, jsonb) to authenticated;

create or replace function public.unsubscribe_email_contact(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.email_contacts;
begin
  select * into v_contact from public.email_contacts where unsubscribe_token = p_token;
  if v_contact.id is null then
    return false;
  end if;
  if v_contact.status = 'unsubscribed' then
    return true;
  end if;
  perform set_config('app.email_allow_status_change', '1', true);
  update public.email_contacts
  set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
  where id = v_contact.id and status <> 'blocked';
  return true;
end;
$$;

revoke all on function public.unsubscribe_email_contact(uuid) from public;
grant execute on function public.unsubscribe_email_contact(uuid) to anon, authenticated;

create or replace function public.enqueue_email_broadcast(
  p_account_id uuid,
  p_connection_id uuid,
  p_sent_by uuid,
  p_subject text,
  p_body text,
  p_request_key uuid,
  p_contact_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200 then
    raise exception 'Invalid subject';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 8000 then
    raise exception 'Invalid message';
  end if;
  if not exists (
    select 1 from public.integration_connections connection
    where connection.id = p_connection_id
      and connection.account_id = p_account_id
      and connection.provider in ('brevo', 'resend', 'smtp')
      and connection.status = 'active'
  ) then
    raise exception 'Active email connection not found';
  end if;

  select broadcast.id into v_broadcast_id
  from public.email_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then
    return v_broadcast_id;
  end if;

  update public.email_broadcast_recipients recipient
  set status = 'failed', last_error = 'Siuntimas nutrūko.', updated_at = now()
  from public.email_broadcasts broadcast
  where recipient.broadcast_id = broadcast.id
    and broadcast.account_id = p_account_id
    and broadcast.status in ('queued', 'processing')
    and broadcast.updated_at < now() - interval '30 minutes'
    and recipient.status in ('queued', 'processing');

  update public.email_broadcasts broadcast
  set sent_count = counts.sent_count,
      failed_count = counts.failed_count,
      blocked_count = counts.blocked_count,
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  from (
    select recipient.broadcast_id,
      count(*) filter (where recipient.status = 'sent')::integer as sent_count,
      count(*) filter (where recipient.status = 'failed')::integer as failed_count,
      count(*) filter (where recipient.status = 'blocked')::integer as blocked_count
    from public.email_broadcast_recipients recipient
    group by recipient.broadcast_id
  ) counts
  where broadcast.id = counts.broadcast_id
    and broadcast.account_id = p_account_id
    and broadcast.status in ('queued', 'processing')
    and broadcast.updated_at < now() - interval '30 minutes';

  if exists (
    select 1 from public.email_broadcasts
    where account_id = p_account_id and status in ('queued', 'processing')
  ) then
    raise exception 'An email broadcast is already running';
  end if;

  insert into public.email_broadcasts (
    account_id, integration_connection_id, subject, body, request_key, created_by, recipient_count
  ) values (
    p_account_id, p_connection_id, btrim(p_subject), btrim(p_body), p_request_key, p_sent_by, 1
  ) returning id into v_broadcast_id;

  insert into public.email_broadcast_recipients (broadcast_id, email_contact_id, email)
  select v_broadcast_id, contact.id, contact.email
  from public.email_contacts contact
  where contact.account_id = p_account_id
    and contact.status = 'active'
    and (p_contact_ids is null or contact.id = any (p_contact_ids));

  get diagnostics v_count = row_count;
  if v_count < 1 then
    raise exception 'No active email contacts';
  end if;
  if v_count > 5000 then
    raise exception 'Select between 1 and 5000 email contacts';
  end if;
  update public.email_broadcasts
  set recipient_count = v_count, updated_at = now()
  where id = v_broadcast_id;
  return v_broadcast_id;
end;
$$;

revoke all on function public.enqueue_email_broadcast(uuid, uuid, uuid, text, text, uuid, uuid[]) from public;
grant execute on function public.enqueue_email_broadcast(uuid, uuid, uuid, text, text, uuid, uuid[]) to service_role;

create or replace function public.claim_email_broadcast_recipients(
  p_broadcast_id uuid,
  p_limit integer
)
returns table (
  recipient_id uuid,
  email_contact_id uuid,
  email text,
  unsubscribe_token uuid,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  update public.email_broadcasts
  set status = 'processing', updated_at = now()
  where id = p_broadcast_id and status in ('queued', 'processing');
  if not found then
    return;
  end if;

  return query
  with candidates as (
    select recipient.id
    from public.email_broadcast_recipients recipient
    where recipient.broadcast_id = p_broadcast_id
      and recipient.status = 'queued'
    order by recipient.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 20)
  ), claimed as (
    update public.email_broadcast_recipients recipient
    set status = 'processing', claim_token = gen_random_uuid(), updated_at = now()
    from candidates
    where recipient.id = candidates.id
    returning recipient.id, recipient.email_contact_id, recipient.email, recipient.claim_token
  )
  select claimed.id, claimed.email_contact_id, claimed.email, contact.unsubscribe_token, claimed.claim_token
  from claimed
  left join public.email_contacts contact on contact.id = claimed.email_contact_id;
end;
$$;

revoke all on function public.claim_email_broadcast_recipients(uuid, integer) from public;
grant execute on function public.claim_email_broadcast_recipients(uuid, integer) to service_role;

create or replace function public.complete_email_broadcast_recipient(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_sent integer;
  v_failed integer;
  v_blocked integer;
  v_pending integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('sent', 'failed', 'blocked') then
    raise exception 'Invalid recipient result';
  end if;
  update public.email_broadcast_recipients
  set status = p_status,
      last_error = left(p_error, 300),
      updated_at = now()
  where id = p_recipient_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning broadcast_id into v_broadcast_id;
  if v_broadcast_id is null then
    return false;
  end if;

  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'blocked'),
    count(*) filter (where status in ('queued', 'processing'))
  into v_sent, v_failed, v_blocked, v_pending
  from public.email_broadcast_recipients
  where broadcast_id = v_broadcast_id;

  update public.email_broadcasts
  set sent_count = v_sent,
      failed_count = v_failed,
      blocked_count = v_blocked,
      status = case when v_pending = 0 then 'completed' else 'processing' end,
      completed_at = case when v_pending = 0 then now() else null end,
      updated_at = now()
  where id = v_broadcast_id;
  return true;
end;
$$;

revoke all on function public.complete_email_broadcast_recipient(uuid, uuid, text, text) from public;
grant execute on function public.complete_email_broadcast_recipient(uuid, uuid, text, text) to service_role;
