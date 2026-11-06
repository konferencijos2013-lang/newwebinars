-- The host preview has no registration, so the attendee chat function cannot
-- accept a message from the person running the webinar.

create or replace function public.send_host_webinar_chat_message(
  p_webinar_id uuid,
  p_message text
) returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.chat_messages;
  v_message text := btrim(coalesce(p_message, ''));
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not allowed to write in this webinar chat' using errcode = '42501';
  end if;
  if not public.can_moderate_webinar(p_webinar_id) then
    raise exception 'Not allowed to write in this webinar chat' using errcode = '42501';
  end if;
  if char_length(v_message) = 0 or char_length(v_message) > 2000 then
    raise exception 'Message must contain between 1 and 2000 characters';
  end if;
  if v_message ~* '(^|[^[:alnum:]_])((https?://|www\.)[^[:space:]]+|[[:alnum:]-]+(\.[[:alnum:]-]+)+(/[^[:space:]]*)?)' then
    raise exception 'Links are not allowed in webinar chat';
  end if;

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(webinar.presenter_name), ''),
    'Pristatytojas'
  )
    into v_name
  from public.webinars webinar
  left join public.profiles profile on profile.id = auth.uid()
  where webinar.id = p_webinar_id;

  insert into public.chat_messages (
    webinar_id, sender_id, sender_name, message, message_type, sent_at
  )
  values (p_webinar_id, auth.uid(), v_name, v_message, 'chat', now())
  returning * into result;
  return result;
end;
$$;

alter function public.send_host_webinar_chat_message(uuid, text) owner to postgres;
revoke all on function public.send_host_webinar_chat_message(uuid, text) from public;
grant execute on function public.send_host_webinar_chat_message(uuid, text) to authenticated;
