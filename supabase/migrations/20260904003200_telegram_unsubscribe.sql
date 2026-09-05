-- Let Telegram users opt out immediately with /stop. This RPC is service-role
-- only and is called by the authenticated Telegram webhook.
create or replace function public.unsubscribe_telegram_contact(
  p_connection_id uuid,
  p_chat_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
begin
  select contact.id into v_contact_id
  from public.telegram_contacts contact
  where contact.integration_connection_id = p_connection_id
    and contact.chat_id = trim(p_chat_id)
  for update;

  if v_contact_id is null then return false; end if;

  update public.telegram_contacts
  set status = 'unsubscribed', last_seen_at = now(), updated_at = now()
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
