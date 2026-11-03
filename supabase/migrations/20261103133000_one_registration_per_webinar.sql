-- One person can register for a webinar only once, including evergreen sessions.

create or replace function public.register_for_webinar(
  p_webinar_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null,
  p_company text default null,
  p_referrer_url text default null,
  p_referral_code text default null,
  p_password text default null
) returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
  v_account_id uuid;
  v_session public.webinar_sessions;
  v_email text;
  v_payment_required boolean;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then raise exception 'Email is required'; end if;
  v_payment_required := public.assert_registration_access(p_webinar_id, v_email, p_password);
  if exists (
    select 1 from public.registrations
    where webinar_id = p_webinar_id
      and lower(email) = v_email
      and cancelled_at is null
  ) then
    raise exception 'You are already registered for this webinar';
  end if;
  v_session := public.resolve_webinar_session(p_webinar_id);
  if not public.is_webinar_open_for_registration(p_webinar_id, v_session.id) then
    raise exception 'Webinar session is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then
    raise exception 'Invalid referral code';
  end if;
  select account_id into v_account_id from public.webinars where id = p_webinar_id;
  perform public.consume_account_credit(
    v_account_id, 'registration', 1, 'webinar', p_webinar_id,
    jsonb_build_object('email', v_email, 'session_id', v_session.id)
  );
  insert into public.registrations (
    webinar_id, session_id, email, full_name, phone, company,
    referrer_url, referral_code, status, registration_method, payment_required
  ) values (
    p_webinar_id, v_session.id, v_email, p_full_name, p_phone, p_company,
    p_referrer_url, p_referral_code, 'registered', 'email', v_payment_required
  ) returning * into result;
  perform public.enqueue_reminders_for_registration(result.id);
  return result;
end;
$$;
alter function public.register_for_webinar(uuid, text, text, text, text, text, text, text) owner to postgres;
grant execute on function public.register_for_webinar(uuid, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.complete_telegram_webinar_registration(
  p_connection_id uuid, p_token text, p_chat_id text,
  p_telegram_user_id text default null, p_username text default null,
  p_first_name text default null, p_last_name text default null,
  p_language_code text default null
)
returns table (result_status text, registration_access_token uuid, webinar_slug text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_intent public.telegram_registration_intents;
  v_contact_id uuid;
  v_registration public.registrations;
  v_existing public.registrations;
  v_slug text;
  v_payment_required boolean := false;
begin
  if p_token !~ '^r_[A-Fa-f0-9]{48}$' or length(trim(coalesce(p_chat_id, ''))) = 0 then
    return query select 'invalid_or_expired'::text, null::uuid, null::text; return;
  end if;
  select i.* into v_intent from public.telegram_registration_intents i
  where i.integration_connection_id = p_connection_id
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if v_intent.id is null then
    return query select 'invalid_or_expired'::text, null::uuid, null::text; return;
  end if;
  if v_intent.status = 'completed' and v_intent.registration_id is not null then
    select r.* into v_registration from public.registrations r where r.id = v_intent.registration_id;
    select w.slug into v_slug from public.webinars w where w.id = v_registration.webinar_id;
    return query select 'already_registered'::text, v_registration.access_token, v_slug; return;
  end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    if v_intent.status = 'pending' then
      update public.telegram_registration_intents set status = 'expired', updated_at = now() where id = v_intent.id;
    end if;
    return query select 'invalid_or_expired'::text, null::uuid, null::text; return;
  end if;
  if not exists (
    select 1 from public.integration_connections ic
    where ic.id = p_connection_id and ic.account_id = v_intent.account_id
      and ic.provider = 'telegram' and ic.status = 'active'
  ) then
    return query select 'integration_unavailable'::text, null::uuid, null::text; return;
  end if;
  if exists (
    select 1 from public.webinars w
    where w.id = v_intent.webinar_id and w.access_mode = 'invited_only'
  ) then
    return query select 'not_invited'::text, null::uuid, null::text; return;
  end if;
  select coalesce(w.access_mode = 'paid_access' and coalesce(w.price_cents, 0) > 0, false)
    into v_payment_required
  from public.webinars w where w.id = v_intent.webinar_id;

  insert into public.telegram_contacts (
    account_id, integration_connection_id, chat_id, telegram_user_id, username,
    first_name, last_name, language_code, status
  ) values (
    v_intent.account_id, p_connection_id, trim(p_chat_id), nullif(trim(p_telegram_user_id), ''),
    nullif(trim(p_username), ''), nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
    nullif(trim(p_language_code), ''), 'active'
  ) on conflict (integration_connection_id, chat_id) do update set
    telegram_user_id = coalesce(excluded.telegram_user_id, telegram_contacts.telegram_user_id),
    username = coalesce(excluded.username, telegram_contacts.username),
    first_name = coalesce(excluded.first_name, telegram_contacts.first_name),
    last_name = coalesce(excluded.last_name, telegram_contacts.last_name),
    language_code = coalesce(excluded.language_code, telegram_contacts.language_code),
    status = 'active', last_seen_at = now(), updated_at = now()
  returning id into v_contact_id;

  select * into v_existing from public.registrations r
  where r.webinar_id = v_intent.webinar_id
    and r.telegram_contact_id = v_contact_id
    and r.cancelled_at is null
  order by r.registered_at
  limit 1;
  if v_existing.id is not null then
    update public.telegram_registration_intents set status = 'completed', completed_at = now(),
      registration_id = v_existing.id, updated_at = now() where id = v_intent.id;
    select w.slug into v_slug from public.webinars w where w.id = v_intent.webinar_id;
    return query select 'already_registered'::text, v_existing.access_token, v_slug; return;
  end if;

  if not public.is_webinar_open_for_registration(v_intent.webinar_id, v_intent.session_id) then
    return query select 'registration_closed'::text, null::uuid, null::text; return;
  end if;

  perform public.consume_account_credit(v_intent.account_id, 'registration', 1, 'webinar',
    v_intent.webinar_id, jsonb_build_object('telegram_contact_id', v_contact_id, 'session_id', v_intent.session_id));
  insert into public.registrations (
    webinar_id, session_id, email, full_name, referrer_url, referral_code, status,
    registration_method, telegram_contact_id, confirmed_at, payment_required
  ) values (
    v_intent.webinar_id, v_intent.session_id, null,
    coalesce(v_intent.full_name, nullif(trim(concat_ws(' ', p_first_name, p_last_name)), '')),
    v_intent.referrer_url, v_intent.referral_code, 'registered', 'telegram', v_contact_id, now(),
    v_payment_required
  ) returning * into v_registration;

  insert into public.registration_message_channels (
    registration_id, integration_connection_id, provider, external_subscriber_id,
    external_channel, telegram_contact_id, status, linked_at
  ) values (
    v_registration.id, p_connection_id, 'telegram', trim(p_chat_id), 'telegram',
    v_contact_id, 'linked', now()
  ) on conflict (registration_id, integration_connection_id, provider) do update set
    external_subscriber_id = excluded.external_subscriber_id, external_channel = 'telegram',
    telegram_contact_id = excluded.telegram_contact_id, status = 'linked', linked_at = now(),
    link_token_hash = null, link_expires_at = null, last_error = null, updated_at = now();

  perform public.enqueue_reminders_for_registration(v_registration.id);
  update public.telegram_registration_intents set status = 'completed', completed_at = now(),
    registration_id = v_registration.id, updated_at = now() where id = v_intent.id;
  select w.slug into v_slug from public.webinars w where w.id = v_intent.webinar_id;
  return query select 'registered'::text, v_registration.access_token, v_slug;
end;
$$;
revoke all on function public.complete_telegram_webinar_registration(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.complete_telegram_webinar_registration(uuid, text, text, text, text, text, text, text) to service_role;

do $guard$
begin
  create unique index registrations_one_email_per_webinar
    on public.registrations (webinar_id, lower(email))
    where cancelled_at is null and email is not null;
exception
  when unique_violation or duplicate_table then null;
end
$guard$;

do $guard$
begin
  create unique index registrations_one_telegram_per_webinar
    on public.registrations (webinar_id, telegram_contact_id)
    where cancelled_at is null and telegram_contact_id is not null;
exception
  when unique_violation or duplicate_table then null;
end
$guard$;
