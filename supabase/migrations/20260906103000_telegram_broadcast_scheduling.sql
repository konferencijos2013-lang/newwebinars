-- Schedule Telegram broadcasts and expose account-scoped cancellation.
alter table public.telegram_broadcasts
  drop constraint if exists telegram_broadcasts_status_check;

alter table public.telegram_broadcasts
  add column scheduled_for timestamptz,
  add column started_at timestamptz,
  add constraint telegram_broadcasts_status_check
    check (status in ('scheduled', 'queued', 'processing', 'completed', 'cancelled')),
  add constraint telegram_broadcasts_schedule_check
    check (
      (status = 'scheduled' and scheduled_for is not null)
      or status <> 'scheduled'
    );

create index telegram_broadcasts_scheduled_idx
  on public.telegram_broadcasts(scheduled_for)
  where status = 'scheduled';

create or replace function public.enqueue_telegram_broadcast(
  p_account_id uuid,
  p_connection_id uuid,
  p_sent_by uuid,
  p_message text,
  p_request_key uuid,
  p_image_path text default null,
  p_contact_ids uuid[] default null,
  p_scheduled_for timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_broadcast_id uuid; v_recipient_count integer; v_requested_count integer; v_status text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Not authorized'; end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 4096 then raise exception 'Invalid message'; end if;
  if p_request_key is null then raise exception 'Request key is required'; end if;
  if p_scheduled_for is not null and p_scheduled_for <= now() + interval '30 seconds' then raise exception 'Scheduled time must be in the future'; end if;
  if p_scheduled_for is not null and p_scheduled_for > now() + interval '1 year' then raise exception 'Scheduled time is too far in the future'; end if;
  if p_image_path is not null and p_image_path !~ ('^' || p_account_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid Telegram broadcast image';
  end if;
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

  v_status := case when p_scheduled_for is null then 'queued' else 'scheduled' end;
  insert into public.telegram_broadcasts (
    account_id, integration_connection_id, sent_by, message, recipient_count,
    status, request_key, image_path, scheduled_for
  ) values (
    p_account_id, p_connection_id, p_sent_by, btrim(p_message), v_recipient_count,
    v_status, p_request_key, p_image_path, p_scheduled_for
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

revoke all on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, text, uuid[], timestamptz) from public;
grant execute on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, text, uuid[], timestamptz) to service_role;

create or replace function public.recover_telegram_broadcasts(p_limit integer default 20)
returns table (broadcast_id uuid)
language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  update public.telegram_broadcast_recipients recipient
  set status = 'failed', last_error = 'Delivery result unknown after worker interruption.',
      claimed_at = null, claim_token = null, updated_at = now()
  where recipient.status = 'processing'
    and recipient.claimed_at < now() - interval '5 minutes';

  with due as (
    select candidate.id
    from (
      select broadcast.id, broadcast.integration_connection_id,
        row_number() over (
          partition by broadcast.integration_connection_id
          order by broadcast.scheduled_for, broadcast.created_at
        ) as position
      from public.telegram_broadcasts broadcast
      where broadcast.status = 'scheduled' and broadcast.scheduled_for <= now()
    ) candidate
    where candidate.position = 1
      and not exists (
        select 1 from public.telegram_broadcasts active
        where active.integration_connection_id = candidate.integration_connection_id
          and active.status in ('queued', 'processing')
      )
  )
  update public.telegram_broadcasts broadcast
  set status = 'queued', started_at = coalesce(started_at, now()), updated_at = now()
  from due where broadcast.id = due.id;

  return query
  select broadcast.id
  from public.telegram_broadcasts broadcast
  where broadcast.status in ('queued', 'processing')
  order by coalesce(broadcast.scheduled_for, broadcast.created_at), broadcast.created_at
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.recover_telegram_broadcasts(integer) from public;
grant execute on function public.recover_telegram_broadcasts(integer) to service_role;

create or replace function public.cancel_scheduled_telegram_broadcast(p_broadcast_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_updated integer;
begin
  update public.telegram_broadcasts broadcast
  set status = 'cancelled', updated_at = now()
  where broadcast.id = p_broadcast_id
    and broadcast.status = 'scheduled'
    and (
      public.has_account_role(broadcast.account_id, array['owner', 'admin'])
      or public.is_platform_admin()
    );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.cancel_scheduled_telegram_broadcast(uuid) from public;
grant execute on function public.cancel_scheduled_telegram_broadcast(uuid) to authenticated;

-- The Telegram webhook runs as service_role and must be allowed to meter AI replies.
grant execute on function public.consume_account_credit(
  uuid, public.credit_type, integer, public.usage_event_scope, uuid, jsonb
) to service_role;
