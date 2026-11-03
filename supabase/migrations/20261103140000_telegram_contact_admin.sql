-- Telegram bot contact list: keep bans, allow the host to block or delete
-- a contact, and import contacts the bot can already message.

alter table public.telegram_broadcast_recipients
  drop constraint if exists telegram_broadcast_recipients_telegram_contact_id_fkey;

alter table public.telegram_broadcast_recipients
  alter column telegram_contact_id drop not null;

alter table public.telegram_broadcast_recipients
  add constraint telegram_broadcast_recipients_telegram_contact_id_fkey
  foreign key (telegram_contact_id) references public.telegram_contacts(id) on delete set null;

create or replace function public.telegram_contacts_preserve_block()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'blocked'
     and new.status is distinct from 'blocked'
     and current_setting('app.telegram_allow_unblock', true) is distinct from '1' then
    new.status := 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists telegram_contacts_preserve_block on public.telegram_contacts;
create trigger telegram_contacts_preserve_block
  before update on public.telegram_contacts
  for each row execute function public.telegram_contacts_preserve_block();

create or replace function public.touch_telegram_bot_contact(
  p_connection_id uuid,
  p_chat_id text,
  p_telegram_user_id text default null,
  p_username text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_language_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_status text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if p_chat_id !~ '^-?[0-9]{1,20}$' then
    raise exception 'Invalid chat';
  end if;
  select account_id into v_account_id
  from public.integration_connections
  where id = p_connection_id and provider = 'telegram' and status = 'active';
  if v_account_id is null then
    raise exception 'Active Telegram connection not found';
  end if;

  insert into public.telegram_contacts (
    account_id, integration_connection_id, chat_id, telegram_user_id, username,
    first_name, last_name, language_code, status, broadcast_opted_in_at,
    broadcast_consent_version
  ) values (
    v_account_id, p_connection_id, p_chat_id, nullif(trim(p_telegram_user_id), ''),
    nullif(trim(p_username), ''), nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''), nullif(trim(p_language_code), ''),
    'active', now(), 'bot-chat'
  )
  on conflict (integration_connection_id, chat_id) do update set
    telegram_user_id = coalesce(excluded.telegram_user_id, telegram_contacts.telegram_user_id),
    username = coalesce(excluded.username, telegram_contacts.username),
    first_name = coalesce(excluded.first_name, telegram_contacts.first_name),
    last_name = coalesce(excluded.last_name, telegram_contacts.last_name),
    language_code = coalesce(excluded.language_code, telegram_contacts.language_code),
    last_seen_at = now(),
    updated_at = now()
  returning status into v_status;
  return v_status;
end;
$$;

revoke all on function public.touch_telegram_bot_contact(uuid, text, text, text, text, text, text) from public;
grant execute on function public.touch_telegram_bot_contact(uuid, text, text, text, text, text, text) to service_role;

create or replace function public.set_telegram_contact_status(
  p_contact_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.telegram_contacts;
begin
  if p_status not in ('active', 'blocked') then
    raise exception 'Invalid status';
  end if;
  select * into v_contact from public.telegram_contacts where id = p_contact_id;
  if v_contact.id is null then
    raise exception 'Contact not found';
  end if;
  if not (
    public.has_account_role(v_contact.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  if p_status = 'active' then
    perform set_config('app.telegram_allow_unblock', '1', true);
  end if;
  update public.telegram_contacts
  set status = p_status, updated_at = now()
  where id = p_contact_id;

  if p_status = 'blocked' then
    update public.registration_message_channels
    set status = 'blocked', updated_at = now()
    where telegram_contact_id = p_contact_id and provider = 'telegram';
  else
    update public.registration_message_channels
    set status = 'linked', updated_at = now()
    where telegram_contact_id = p_contact_id
      and provider = 'telegram'
      and status = 'blocked';
  end if;
end;
$$;

revoke all on function public.set_telegram_contact_status(uuid, text) from public;
grant execute on function public.set_telegram_contact_status(uuid, text) to authenticated;

create or replace function public.delete_telegram_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.telegram_contacts;
begin
  select * into v_contact from public.telegram_contacts where id = p_contact_id;
  if v_contact.id is null then
    raise exception 'Contact not found';
  end if;
  if not (
    public.has_account_role(v_contact.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  update public.registration_message_channels
  set status = 'invalid', telegram_contact_id = null, updated_at = now()
  where telegram_contact_id = p_contact_id and provider = 'telegram';

  delete from public.telegram_contacts where id = p_contact_id;
end;
$$;

revoke all on function public.delete_telegram_contact(uuid) from public;
grant execute on function public.delete_telegram_contact(uuid) to authenticated;

create or replace function public.import_telegram_contacts(
  p_connection_id uuid,
  p_rows jsonb
)
returns table (inserted_count integer, updated_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.integration_connections;
  v_row jsonb;
  v_chat_id text;
  v_existed boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_seen integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import between 1 and 1000 contacts';
  end if;
  select * into v_connection
  from public.integration_connections
  where id = p_connection_id and provider = 'telegram' and status = 'active';
  if v_connection.id is null then
    raise exception 'Active Telegram connection not found';
  end if;
  if not (
    public.has_account_role(v_connection.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_seen := v_seen + 1;
    v_chat_id := left(trim(coalesce(v_row ->> 'chat_id', '')), 32);
    if v_chat_id !~ '^-?[0-9]{1,20}$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select exists (
      select 1 from public.telegram_contacts
      where integration_connection_id = p_connection_id and chat_id = v_chat_id
    ) into v_existed;

    insert into public.telegram_contacts (
      account_id, integration_connection_id, chat_id, telegram_user_id, username,
      first_name, last_name, status, broadcast_opted_in_at, broadcast_consent_version
    ) values (
      v_connection.account_id,
      p_connection_id,
      v_chat_id,
      nullif(left(trim(coalesce(v_row ->> 'telegram_user_id', '')), 32), ''),
      nullif(left(trim(coalesce(v_row ->> 'username', '')), 32), ''),
      nullif(left(trim(coalesce(v_row ->> 'first_name', '')), 64), ''),
      nullif(left(trim(coalesce(v_row ->> 'last_name', '')), 64), ''),
      'active',
      now(),
      'import'
    )
    on conflict (integration_connection_id, chat_id) do update set
      telegram_user_id = coalesce(excluded.telegram_user_id, telegram_contacts.telegram_user_id),
      username = coalesce(excluded.username, telegram_contacts.username),
      first_name = coalesce(excluded.first_name, telegram_contacts.first_name),
      last_name = coalesce(excluded.last_name, telegram_contacts.last_name),
      updated_at = now();

    if v_existed then
      v_updated := v_updated + 1;
    else
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  if v_seen = 0 then
    raise exception 'Import between 1 and 1000 contacts';
  end if;
  return query select v_inserted, v_updated, v_skipped;
end;
$$;

revoke all on function public.import_telegram_contacts(uuid, jsonb) from public;
grant execute on function public.import_telegram_contacts(uuid, jsonb) to authenticated;
