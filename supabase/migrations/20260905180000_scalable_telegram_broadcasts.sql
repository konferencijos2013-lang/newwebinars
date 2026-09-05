-- Durable, batched Telegram broadcasts with a frozen recipient snapshot.
alter table public.telegram_broadcasts
  drop constraint if exists telegram_broadcasts_recipient_count_check,
  drop constraint if exists telegram_broadcasts_check;

alter table public.telegram_broadcasts
  add column status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'cancelled')),
  add column completed_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add column request_key uuid;

-- Rows created by the former synchronous implementation are already final.
update public.telegram_broadcasts
set status = 'completed', completed_at = created_at, updated_at = created_at;

alter table public.telegram_broadcasts
  add constraint telegram_broadcasts_recipient_count_check
    check (recipient_count >= 1),
  add constraint telegram_broadcasts_progress_check
    check (sent_count + failed_count + blocked_count <= recipient_count),
  add constraint telegram_broadcasts_lifecycle_check
    check (
      (status = 'completed' and completed_at is not null
        and sent_count + failed_count + blocked_count = recipient_count)
      or (status <> 'completed' and completed_at is null)
    );

create unique index telegram_broadcasts_request_key_idx
  on public.telegram_broadcasts(account_id, request_key)
  where request_key is not null;
create unique index telegram_broadcasts_one_active_per_connection_idx
  on public.telegram_broadcasts(integration_connection_id)
  where status in ('queued', 'processing');

create table public.telegram_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.telegram_broadcasts(id) on delete cascade,
  telegram_contact_id uuid not null references public.telegram_contacts(id) on delete restrict,
  chat_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed', 'blocked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, telegram_contact_id)
);

create index telegram_broadcast_recipients_claim_idx
  on public.telegram_broadcast_recipients(broadcast_id, status, next_attempt_at, created_at);

alter table public.telegram_broadcast_recipients enable row level security;

create or replace function public.claim_telegram_broadcast_recipients(
  p_broadcast_id uuid,
  p_limit integer default 30
)
returns table (recipient_id uuid, telegram_contact_id uuid, chat_id text, claim_token uuid)
language plpgsql security definer set search_path = public
as $$
declare v_connection_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select broadcast.integration_connection_id into v_connection_id
  from public.telegram_broadcasts broadcast
  where broadcast.id = p_broadcast_id
    and broadcast.status in ('queued', 'processing');
  if v_connection_id is null then return; end if;

  -- One active delivery batch per bot, including across separate broadcasts.
  perform pg_advisory_xact_lock(hashtextextended(v_connection_id::text, 0));
  if exists (
    select 1
    from public.telegram_broadcast_recipients recipient
    join public.telegram_broadcasts broadcast on broadcast.id = recipient.broadcast_id
    where broadcast.integration_connection_id = v_connection_id
      and recipient.status = 'processing'
  ) then return; end if;

  -- Consent is authorization at send time, not only when the audience is frozen.
  update public.telegram_broadcast_recipients recipient
  set status = 'failed', last_error = 'Contact revoked consent or is no longer active.',
      updated_at = now()
  where recipient.broadcast_id = p_broadcast_id
    and recipient.status = 'queued'
    and not exists (
      select 1 from public.telegram_contacts contact
      join public.telegram_broadcasts broadcast on broadcast.id = recipient.broadcast_id
      where contact.id = recipient.telegram_contact_id
        and contact.account_id = broadcast.account_id
        and contact.integration_connection_id = broadcast.integration_connection_id
        and contact.status = 'active'
        and contact.broadcast_opted_in_at is not null
    );

  return query
  with candidates as (
    select recipient.id
    from public.telegram_broadcast_recipients recipient
    where recipient.broadcast_id = p_broadcast_id
      and recipient.status = 'queued'
      and recipient.next_attempt_at <= now()
      and recipient.attempt_count < 5
    order by recipient.next_attempt_at, recipient.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.telegram_broadcast_recipients recipient
    set status = 'processing', attempt_count = attempt_count + 1,
        claimed_at = now(), claim_token = gen_random_uuid(), updated_at = now()
    from candidates
    where recipient.id = candidates.id
    returning recipient.id, recipient.telegram_contact_id, recipient.chat_id, recipient.claim_token
  )
  select claimed.id, claimed.telegram_contact_id, claimed.chat_id, claimed.claim_token from claimed;
end;
$$;

revoke all on function public.claim_telegram_broadcast_recipients(uuid, integer) from public;
grant execute on function public.claim_telegram_broadcast_recipients(uuid, integer) to service_role;

create or replace function public.complete_telegram_broadcast_recipient(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error text default null,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_row_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('sent', 'failed', 'blocked', 'retry') then
    raise exception 'Invalid recipient result';
  end if;

  update public.telegram_broadcast_recipients recipient
  set status = case
        when p_status = 'retry' and recipient.attempt_count < 5 then 'queued'
        when p_status = 'retry' then 'failed'
        else p_status
      end,
      next_attempt_at = case
        when p_status = 'retry' and recipient.attempt_count < 5
          then now() + make_interval(secs => least(greatest(
            coalesce(p_retry_after_seconds, power(2, recipient.attempt_count)::integer), 1), 3600))
        else recipient.next_attempt_at
      end,
      last_error = left(p_error, 500),
      delivered_at = case when p_status = 'sent' then now() else null end,
      claimed_at = null, claim_token = null, updated_at = now()
  where recipient.id = p_recipient_id
    and recipient.status = 'processing'
    and recipient.claim_token = p_claim_token;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.complete_telegram_broadcast_recipient(uuid, uuid, text, text, integer) from public;
grant execute on function public.complete_telegram_broadcast_recipient(uuid, uuid, text, text, integer) to service_role;

create or replace function public.summarize_telegram_broadcast(p_broadcast_id uuid)
returns table (
  id uuid, status text, recipient_count integer, sent_count integer,
  failed_count integer, blocked_count integer, created_at timestamptz, completed_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_sent integer; v_failed integer; v_blocked integer; v_pending integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  select count(*) filter (where recipient.status = 'sent'),
         count(*) filter (where recipient.status = 'failed'),
         count(*) filter (where recipient.status = 'blocked'),
         count(*) filter (where recipient.status in ('queued', 'processing'))
  into v_sent, v_failed, v_blocked, v_pending
  from public.telegram_broadcast_recipients recipient
  where recipient.broadcast_id = p_broadcast_id;

  return query
  update public.telegram_broadcasts broadcast
  set status = case when v_pending = 0 then 'completed' else 'processing' end,
      sent_count = v_sent, failed_count = v_failed, blocked_count = v_blocked,
      completed_at = case when v_pending = 0 then coalesce(broadcast.completed_at, now()) else null end,
      updated_at = now()
  where broadcast.id = p_broadcast_id
    and broadcast.status in ('queued', 'processing')
  returning broadcast.id, broadcast.status, broadcast.recipient_count,
    broadcast.sent_count, broadcast.failed_count, broadcast.blocked_count,
    broadcast.created_at, broadcast.completed_at;
end;
$$;

revoke all on function public.summarize_telegram_broadcast(uuid) from public;
grant execute on function public.summarize_telegram_broadcast(uuid) to service_role;

create or replace function public.recover_telegram_broadcasts(p_limit integer default 20)
returns table (broadcast_id uuid)
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  -- Never automatically resend an ambiguous delivery after a worker crash.
  update public.telegram_broadcast_recipients recipient
  set status = 'failed', last_error = 'Delivery result unknown after worker interruption.',
      claimed_at = null, claim_token = null, updated_at = now()
  where recipient.status = 'processing'
    and recipient.claimed_at < now() - interval '5 minutes';

  return query
  select broadcast.id
  from public.telegram_broadcasts broadcast
  where broadcast.status in ('queued', 'processing')
  order by broadcast.created_at
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.recover_telegram_broadcasts(integer) from public;
grant execute on function public.recover_telegram_broadcasts(integer) to service_role;

create or replace function public.enqueue_telegram_broadcast(
  p_account_id uuid,
  p_connection_id uuid,
  p_sent_by uuid,
  p_message text,
  p_request_key uuid,
  p_contact_ids uuid[] default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_broadcast_id uuid; v_recipient_count integer; v_requested_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Not authorized'; end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 4096 then raise exception 'Invalid message'; end if;
  if p_request_key is null then raise exception 'Request key is required'; end if;
  select broadcast.id into v_broadcast_id from public.telegram_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then return v_broadcast_id; end if;
  if not exists (
    select 1 from public.integration_connections connection
    where connection.id = p_connection_id and connection.account_id = p_account_id
      and connection.provider = 'telegram' and connection.status = 'active'
  ) then raise exception 'Active Telegram connection not found'; end if;

  if p_contact_ids is not null then
    select count(distinct contact_id) into v_requested_count from unnest(p_contact_ids) contact_id;
    if v_requested_count < 1 or v_requested_count > 5000 then raise exception 'Select between 1 and 5000 Telegram contacts'; end if;
  end if;

  drop table if exists pg_temp.telegram_broadcast_audience;
  create temporary table telegram_broadcast_audience (contact_id uuid primary key, chat_id text not null) on commit drop;
  insert into telegram_broadcast_audience(contact_id, chat_id)
  select contact.id, contact.chat_id
  from public.telegram_contacts contact
  where contact.account_id = p_account_id
    and contact.integration_connection_id = p_connection_id
    and contact.status = 'active' and contact.broadcast_opted_in_at is not null
    and (p_contact_ids is null or contact.id = any(p_contact_ids))
  order by contact.id
  limit 5001;
  select count(*) into v_recipient_count from telegram_broadcast_audience;
  if v_recipient_count < 1 then raise exception 'No eligible Telegram contacts found'; end if;
  if v_recipient_count > 5000 then raise exception 'Telegram broadcast audience exceeds 5000 contacts'; end if;
  if p_contact_ids is not null and v_recipient_count <> v_requested_count then raise exception 'One or more selected contacts are unavailable'; end if;

  insert into public.telegram_broadcasts (
    account_id, integration_connection_id, sent_by, message, recipient_count, status, request_key
  ) values (
    p_account_id, p_connection_id, p_sent_by, btrim(p_message), v_recipient_count, 'queued', p_request_key
  ) returning public.telegram_broadcasts.id into v_broadcast_id;
  insert into public.telegram_broadcast_recipients (broadcast_id, telegram_contact_id, chat_id)
  select v_broadcast_id, audience.contact_id, audience.chat_id from telegram_broadcast_audience audience;
  return v_broadcast_id;
exception when unique_violation then
  select broadcast.id into v_broadcast_id from public.telegram_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then return v_broadcast_id; end if;
  raise exception 'Another Telegram broadcast is already active for this bot';
end;
$$;

revoke all on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, uuid[]) from public;
grant execute on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, uuid[]) to service_role;
