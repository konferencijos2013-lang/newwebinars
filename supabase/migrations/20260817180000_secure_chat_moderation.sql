-- -----------------------------------------------------------------
-- Secure webinar chat moderation
-- -----------------------------------------------------------------
-- Moderation is enforced through SECURITY DEFINER functions. Browser checks
-- remain a convenience only: participants cannot bypass them with PostgREST.

alter table public.registrations
  add column if not exists chat_blocked_at timestamptz,
  add column if not exists chat_blocked_by uuid references public.profiles(id) on delete set null,
  add column if not exists removed_from_webinar_at timestamptz,
  add column if not exists removed_from_webinar_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_chat_messages_webinar_registration_active
  on public.chat_messages (webinar_id, registration_id, sent_at)
  where deleted_at is null;

-- A moderator must belong to the webinar account as owner, admin or host.
create or replace function public.can_moderate_webinar(p_webinar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_account_role(
    (select account_id from public.webinars where id = p_webinar_id),
    array['owner', 'admin', 'host']
  );
$$;

alter function public.can_moderate_webinar(uuid) owner to postgres;
grant execute on function public.can_moderate_webinar(uuid) to authenticated;

-- Block/unblock only affects chat. Removing a registration also hides all of
-- its existing messages, which is the behaviour requested for a ban.
create or replace function public.moderate_webinar_registration(
  p_registration_id uuid,
  p_action text
) returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  select * into result from public.registrations where id = p_registration_id;
  if not found then raise exception 'Registration not found'; end if;
  if not public.can_moderate_webinar(result.webinar_id) then
    raise exception 'Not allowed to moderate this webinar' using errcode = '42501';
  end if;

  case p_action
    when 'mute' then
      update public.registrations set chat_blocked_at = now(), chat_blocked_by = auth.uid()
      where id = result.id returning * into result;
    when 'unmute' then
      update public.registrations set chat_blocked_at = null, chat_blocked_by = null
      where id = result.id returning * into result;
    when 'remove' then
      update public.registrations
      set removed_from_webinar_at = now(), removed_from_webinar_by = auth.uid()
      where id = result.id returning * into result;
      update public.chat_messages
      set deleted_at = now(), deleted_by = auth.uid()
      where registration_id = result.id and deleted_at is null;
      select * into result from public.registrations where id = result.id;
    when 'restore' then
      update public.registrations
      set removed_from_webinar_at = null, removed_from_webinar_by = null
      where id = result.id returning * into result;
    else raise exception 'Unsupported moderation action';
  end case;
  return result;
end;
$$;

alter function public.moderate_webinar_registration(uuid, text) owner to postgres;
grant execute on function public.moderate_webinar_registration(uuid, text) to authenticated;

create or replace function public.soft_delete_chat_message(p_message_id uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare result public.chat_messages;
begin
  select * into result from public.chat_messages where id = p_message_id;
  if not found then raise exception 'Chat message not found'; end if;
  if not public.can_moderate_webinar(result.webinar_id) then
    raise exception 'Not allowed to moderate this webinar' using errcode = '42501';
  end if;
  update public.chat_messages set deleted_at = now(), deleted_by = auth.uid()
  where id = p_message_id and deleted_at is null returning * into result;
  return result;
end;
$$;

alter function public.soft_delete_chat_message(uuid) owner to postgres;
grant execute on function public.soft_delete_chat_message(uuid) to authenticated;

-- The access token is the attendee's bearer credential. Validate it inside the
-- database so callers cannot impersonate another registration or submit links.
create or replace function public.send_webinar_chat_message(
  p_webinar_id uuid,
  p_access_token uuid,
  p_message text
) returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.chat_messages;
  v_registration public.registrations;
  v_message text := btrim(coalesce(p_message, ''));
begin
  if char_length(v_message) = 0 or char_length(v_message) > 2000 then
    raise exception 'Message must contain between 1 and 2000 characters';
  end if;
  -- Blocks http(s), www. and bare domains. It deliberately permits normal
  -- sentence punctuation but prevents URLs even when calling the RPC directly.
  if v_message ~* '(^|[^[:alnum:]_])((https?://|www\.)[^[:space:]]+|[[:alnum:]-]+(\.[[:alnum:]-]+)+(/[^[:space:]]*)?)' then
    raise exception 'Links are not allowed in webinar chat';
  end if;

  select * into v_registration
  from public.registrations
  where access_token = p_access_token and webinar_id = p_webinar_id;
  if not found then raise exception 'Registration does not match webinar' using errcode = '42501'; end if;
  if v_registration.removed_from_webinar_at is not null then
    raise exception 'You have been removed from this webinar' using errcode = '42501';
  end if;
  if v_registration.chat_blocked_at is not null then
    raise exception 'You are muted in webinar chat' using errcode = '42501';
  end if;

  insert into public.chat_messages (webinar_id, registration_id, sender_name, message, message_type, sent_at)
  values (p_webinar_id, v_registration.id, coalesce(v_registration.full_name, 'Guest'), v_message, 'chat', now())
  returning * into result;
  return result;
end;
$$;

alter function public.send_webinar_chat_message(uuid, uuid, text) owner to postgres;
grant execute on function public.send_webinar_chat_message(uuid, uuid, text) to anon, authenticated;

create or replace function public.get_webinar_moderation_messages(p_webinar_id uuid)
returns table (
  id uuid, webinar_id uuid, registration_id uuid, sender_name text, message text,
  message_type text, sent_at timestamptz, deleted_at timestamptz,
  chat_blocked_at timestamptz, removed_from_webinar_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.webinar_id, m.registration_id, m.sender_name, m.message,
         m.message_type::text, m.sent_at, m.deleted_at,
         r.chat_blocked_at, r.removed_from_webinar_at
  from public.chat_messages m
  left join public.registrations r on r.id = m.registration_id
  where m.webinar_id = p_webinar_id
    and public.can_moderate_webinar(p_webinar_id)
  order by m.sent_at asc;
$$;

alter function public.get_webinar_moderation_messages(uuid) owner to postgres;
grant execute on function public.get_webinar_moderation_messages(uuid) to authenticated;

-- A removed attendee cannot use a still-valid token to enter the waiting room
-- or webinar. Existing access-token RPCs keep their narrow, token-only scope.
create or replace function public.mark_registration_entered_waiting_room (p_access_token uuid)
returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare result public.registrations;
begin
  update public.registrations set entered_waiting_room_at = now(), entered_at = now()
  where access_token = p_access_token and removed_from_webinar_at is null
  returning * into result;
  if not found then raise exception 'Registration not found or removed' using errcode = '42501'; end if;
  return result;
end;
$$;

create or replace function public.mark_registration_joined_webinar (p_access_token uuid)
returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare result public.registrations;
begin
  update public.registrations set joined_webinar_at = now(), joined_at = now()
  where access_token = p_access_token and removed_from_webinar_at is null
  returning * into result;
  if not found then raise exception 'Registration not found or removed' using errcode = '42501'; end if;
  return result;
end;
$$;

alter function public.mark_registration_entered_waiting_room(uuid) owner to postgres;
alter function public.mark_registration_joined_webinar(uuid) owner to postgres;

-- Direct writes/deletes were the bypass around moderation. Public reads still
-- expose only visible messages; moderators use the scoped RPC above.
revoke insert, update, delete on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to anon, authenticated;
drop policy if exists "Chat messages: registrants can insert" on public.chat_messages;
drop policy if exists "Chat messages: account members can delete" on public.chat_messages;

drop policy if exists "Chat messages: webinar participants can view" on public.chat_messages;
create policy "Chat messages: visible public messages"
  on public.chat_messages for select to anon, authenticated
  using (deleted_at is null and public.is_webinar_public(webinar_id));
