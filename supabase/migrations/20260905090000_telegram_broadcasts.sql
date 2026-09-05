-- Require separate, explicit consent for free-form account messages. Existing
-- reminder-only contacts remain ineligible until they start the bot again from
-- the updated disclosure in the waiting room.
alter table public.telegram_contacts
  add column broadcast_opted_in_at timestamptz,
  add column broadcast_consent_version text;

-- Audit account-authorized free-form Telegram broadcasts without exposing bot credentials.
create table public.telegram_broadcasts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sent_by uuid not null references public.profiles(id) on delete restrict,
  message text not null check (char_length(btrim(message)) between 1 and 4096),
  recipient_count integer not null check (recipient_count between 1 and 100),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  created_at timestamptz not null default now(),
  check (sent_count + failed_count + blocked_count = recipient_count)
);

create index telegram_broadcasts_account_created_idx
  on public.telegram_broadcasts(account_id, created_at desc);

alter table public.telegram_broadcasts enable row level security;
grant select on public.telegram_broadcasts to authenticated;
create policy "Telegram broadcasts: account admins can view"
  on public.telegram_broadcasts for select to authenticated
  using (
    public.has_account_role(account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  );


create or replace function public.get_telegram_link_options(p_access_token uuid)
returns table (
  integration_connection_id uuid,
  status text,
  connect_url text,
  expires_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare
  v_registration_id uuid;
  v_token text;
  v_expires timestamptz := now() + interval '30 minutes';
  v_channel record;
begin
  select reg.id into v_registration_id
  from public.registrations reg
  where reg.access_token = p_access_token and reg.cancelled_at is null;
  if v_registration_id is null then return; end if;

  perform public.prepare_telegram_channels_for_registration(v_registration_id);
  for v_channel in
    select mc.integration_connection_id, mc.status, mc.telegram_contact_id,
      coalesce(ic.config ->> 'bot_username', '') as bot_username,
      tc.broadcast_opted_in_at
    from public.registration_message_channels mc
    join public.integration_connections ic on ic.id = mc.integration_connection_id
    left join public.telegram_contacts tc on tc.id = mc.telegram_contact_id
    where mc.registration_id = v_registration_id
      and mc.provider = 'telegram'
      and ic.provider = 'telegram'
      and ic.status = 'active'
  loop
    integration_connection_id := v_channel.integration_connection_id;
    if v_channel.status = 'linked' and v_channel.broadcast_opted_in_at is not null then
      status := 'linked'; connect_url := null; expires_at := null; return next;
      continue;
    end if;
    if v_channel.bot_username = '' then continue; end if;

    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.registration_message_channels
    set link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
        link_expires_at = v_expires, last_error = null, updated_at = now()
    where registration_id = v_registration_id
      and integration_connection_id = v_channel.integration_connection_id
      and provider = 'telegram';
    status := 'pending';
    connect_url := format('https://t.me/%s?start=%s', v_channel.bot_username, v_token);
    expires_at := v_expires;
    return next;
  end loop;
end;
$$;
revoke all on function public.get_telegram_link_options(uuid) from public;
grant execute on function public.get_telegram_link_options(uuid) to anon, authenticated;

create or replace function public.link_telegram_contact(
  p_connection_id uuid,
  p_link_token text,
  p_chat_id text,
  p_telegram_user_id text default null,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_state public.registration_message_channels;
  v_account_id uuid;
  v_contact_id uuid;
begin
  if length(trim(coalesce(p_link_token, ''))) < 32
    or length(trim(coalesce(p_chat_id, ''))) = 0 then
    raise exception 'Invalid Telegram linking payload';
  end if;

  select channel.* into v_state
  from public.registration_message_channels channel
  where channel.integration_connection_id = p_connection_id
    and channel.provider = 'telegram'
    and channel.link_token_hash = encode(extensions.digest(p_link_token, 'sha256'), 'hex')
    and channel.link_expires_at > now()
  for update;
  if v_state.id is null then return 'invalid_or_expired'; end if;

  select account_id into v_account_id
  from public.integration_connections
  where id = p_connection_id and provider = 'telegram' and status = 'active';
  if v_account_id is null then return 'integration_unavailable'; end if;

  insert into public.telegram_contacts (
    account_id, integration_connection_id, chat_id, telegram_user_id,
    username, first_name, last_name, language_code,
    broadcast_opted_in_at, broadcast_consent_version
  ) values (
    v_account_id, p_connection_id, trim(p_chat_id), nullif(trim(p_telegram_user_id), ''),
    nullif(trim(p_username), ''), nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''), nullif(trim(p_language_code), ''),
    now(), '2026-09-05-v1'
  )
  on conflict (integration_connection_id, chat_id) do update set
    telegram_user_id = coalesce(excluded.telegram_user_id, telegram_contacts.telegram_user_id),
    username = coalesce(excluded.username, telegram_contacts.username),
    first_name = coalesce(excluded.first_name, telegram_contacts.first_name),
    last_name = coalesce(excluded.last_name, telegram_contacts.last_name),
    language_code = coalesce(excluded.language_code, telegram_contacts.language_code),
    status = 'active', broadcast_opted_in_at = now(),
    broadcast_consent_version = '2026-09-05-v1', last_seen_at = now(), updated_at = now()
  returning id into v_contact_id;

  update public.registration_message_channels
  set external_subscriber_id = trim(p_chat_id), external_channel = 'telegram',
      telegram_contact_id = v_contact_id, status = 'linked', linked_at = now(),
      link_token_hash = null, link_expires_at = null, last_error = null, updated_at = now()
  where id = v_state.id;
  return 'linked';
end;
$$;
revoke all on function public.link_telegram_contact(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.link_telegram_contact(uuid, text, text, text, text, text, text, text) to service_role;

create or replace function public.unsubscribe_telegram_contact(
  p_connection_id uuid,
  p_chat_id text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_contact_id uuid;
begin
  select contact.id into v_contact_id
  from public.telegram_contacts contact
  where contact.integration_connection_id = p_connection_id
    and contact.chat_id = trim(p_chat_id)
  for update;
  if v_contact_id is null then return false; end if;

  update public.telegram_contacts
  set status = 'unsubscribed', broadcast_opted_in_at = null,
      broadcast_consent_version = null, last_seen_at = now(), updated_at = now()
  where id = v_contact_id;

  update public.registration_message_channels
  set status = 'unsubscribed', last_error = null, updated_at = now()
  where integration_connection_id = p_connection_id
    and provider = 'telegram'
    and (telegram_contact_id = v_contact_id or external_subscriber_id = trim(p_chat_id));
  return true;
end;
$$;
revoke all on function public.unsubscribe_telegram_contact(uuid, text) from public;
grant execute on function public.unsubscribe_telegram_contact(uuid, text) to service_role;
