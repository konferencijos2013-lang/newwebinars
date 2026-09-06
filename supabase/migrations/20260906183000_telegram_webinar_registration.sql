-- Dual-channel webinar registration: email or verified Telegram identity.

alter table public.webinars
  add column if not exists registration_method text not null default 'email';
alter table public.webinars drop constraint if exists webinars_registration_method_check;
alter table public.webinars add constraint webinars_registration_method_check
  check (registration_method in ('email', 'telegram', 'both'));

alter table public.registrations
  alter column email drop not null,
  add column if not exists registration_method text not null default 'email',
  add column if not exists telegram_contact_id uuid references public.telegram_contacts(id) on delete set null;

alter table public.registrations drop constraint if exists registrations_registration_method_check;
alter table public.registrations add constraint registrations_registration_method_check
  check (registration_method in ('email', 'telegram'));
alter table public.registrations drop constraint if exists registrations_confirmed_identity_check;
alter table public.registrations add constraint registrations_confirmed_identity_check
  check (
    (registration_method = 'email' and email is not null and length(trim(email)) > 0
      and telegram_contact_id is null)
    or (registration_method = 'telegram' and email is null and telegram_contact_id is not null)
  );

-- Public registration creation must go through the metered, capacity-aware RPCs.
drop policy if exists "Registrations: public can register" on public.registrations;
drop policy if exists "Registrations: public can register for published/live webinars" on public.registrations;
revoke insert on public.registrations from anon, authenticated;

drop index if exists public.idx_registrations_active_email;
create unique index idx_registrations_active_session_email
  on public.registrations (session_id, lower(email))
  where cancelled_at is null and email is not null and session_id is not null;
create unique index idx_registrations_active_legacy_webinar_email
  on public.registrations (webinar_id, lower(email))
  where cancelled_at is null and email is not null and session_id is null;
create unique index idx_registrations_active_session_telegram
  on public.registrations (session_id, telegram_contact_id)
  where cancelled_at is null and telegram_contact_id is not null and session_id is not null;
create index idx_registrations_telegram_contact_id
  on public.registrations (telegram_contact_id) where telegram_contact_id is not null;

create table public.telegram_registration_intents (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  session_id uuid not null references public.webinar_sessions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'cancelled')),
  full_name text,
  referrer_url text,
  referral_code text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  registration_id uuid references public.registrations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index telegram_registration_intents_lookup_idx
  on public.telegram_registration_intents(token_hash, status, expires_at);
create index telegram_registration_intents_registration_idx
  on public.telegram_registration_intents(registration_id) where registration_id is not null;
alter table public.telegram_registration_intents enable row level security;

create or replace function public.start_telegram_webinar_registration(
  p_webinar_id uuid,
  p_full_name text default null,
  p_referrer_url text default null,
  p_referral_code text default null
)
returns table (intent_id uuid, connect_url text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_webinar public.webinars;
  v_session public.webinar_sessions;
  v_connection public.integration_connections;
  v_token text;
  v_intent_id uuid;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  select * into v_webinar from public.webinars where id = p_webinar_id;
  if v_webinar.id is null or v_webinar.status not in ('published', 'live') then
    raise exception 'Webinar is not available for registration';
  end if;
  v_session := public.resolve_webinar_session(p_webinar_id);
  if v_session.id is null or not public.is_webinar_open_for_registration(p_webinar_id, v_session.id) then
    raise exception 'Webinar session is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then
    raise exception 'Invalid referral code';
  end if;
  select ic.* into v_connection
  from public.integration_connections ic
  where ic.account_id = v_webinar.account_id and ic.provider = 'telegram'
    and ic.status = 'active' and length(trim(coalesce(ic.config ->> 'bot_username', ''))) > 0
  order by ic.created_at
  limit 1;
  if v_connection.id is null then raise exception 'Telegram registration is not configured'; end if;

  v_token := 'r_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.telegram_registration_intents (
    webinar_id, session_id, account_id, integration_connection_id, token_hash,
    full_name, referrer_url, referral_code, expires_at
  ) values (
    p_webinar_id, v_session.id, v_webinar.account_id, v_connection.id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), nullif(trim(p_full_name), ''),
    p_referrer_url, p_referral_code, v_expires
  ) returning id into v_intent_id;
  return query select v_intent_id,
    format('https://t.me/%s?start=%s', v_connection.config ->> 'bot_username', v_token), v_expires;
end;
$$;
revoke all on function public.start_telegram_webinar_registration(uuid, text, text, text) from public;
grant execute on function public.start_telegram_webinar_registration(uuid, text, text, text) to anon, authenticated;

create or replace function public.get_telegram_registration_intent_status(p_intent_id uuid)
returns table (status text, registration_access_token uuid, expires_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select
    case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    case when i.status = 'completed' then r.access_token else null end,
    i.expires_at
  from public.telegram_registration_intents i
  left join public.registrations r on r.id = i.registration_id
  where i.id = p_intent_id
$$;
revoke all on function public.get_telegram_registration_intent_status(uuid) from public;
grant execute on function public.get_telegram_registration_intent_status(uuid) to anon, authenticated;

create or replace function public.complete_telegram_webinar_registration(
  p_connection_id uuid, p_token text, p_chat_id text,
  p_telegram_user_id text default null, p_username text default null,
  p_first_name text default null, p_last_name text default null,
  p_language_code text default null
)
returns table (result_status text, registration_access_token uuid, webinar_slug text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_intent public.telegram_registration_intents;
  v_contact_id uuid;
  v_registration public.registrations;
  v_existing public.registrations;
  v_slug text;
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
    select r.* into v_registration
    from public.registrations r
    where r.id = v_intent.registration_id;
    select w.slug into v_slug
    from public.webinars w
    where w.id = v_registration.webinar_id;
    return query select 'already_registered'::text, v_registration.access_token, v_slug; return;
  end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    if v_intent.status = 'pending' then
      update public.telegram_registration_intents set status = 'expired', updated_at = now() where id = v_intent.id;
    end if;
    return query select 'invalid_or_expired'::text, null::uuid, null::text; return;
  end if;
  if not exists (select 1 from public.integration_connections ic where ic.id = p_connection_id
    and ic.account_id = v_intent.account_id and ic.provider = 'telegram' and ic.status = 'active') then
    return query select 'integration_unavailable'::text, null::uuid, null::text; return;
  end if;

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

  select * into v_existing from public.registrations r where r.session_id = v_intent.session_id
    and r.telegram_contact_id = v_contact_id and r.cancelled_at is null;
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
    registration_method, telegram_contact_id, confirmed_at
  ) values (
    v_intent.webinar_id, v_intent.session_id, null,
    coalesce(v_intent.full_name, nullif(trim(concat_ws(' ', p_first_name, p_last_name)), '')),
    v_intent.referrer_url, v_intent.referral_code, 'registered', 'telegram', v_contact_id, now()
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

create or replace function public.register_for_webinar(
  p_webinar_id uuid, p_email text, p_full_name text default null, p_phone text default null,
  p_company text default null, p_referrer_url text default null, p_referral_code text default null
) returns public.registrations language plpgsql security definer set search_path = public
as $$
declare result public.registrations; v_account_id uuid; v_session public.webinar_sessions; v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then raise exception 'Email is required'; end if;
  v_session := public.resolve_webinar_session(p_webinar_id);
  if not public.is_webinar_open_for_registration(p_webinar_id, v_session.id) then
    raise exception 'Webinar session is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then raise exception 'Invalid referral code'; end if;
  if exists (select 1 from public.registrations where session_id = v_session.id and lower(email) = v_email and cancelled_at is null) then
    raise exception 'You are already registered for this webinar session';
  end if;
  select account_id into v_account_id from public.webinars where id = p_webinar_id;
  perform public.consume_account_credit(v_account_id, 'registration', 1, 'webinar', p_webinar_id,
    jsonb_build_object('email', v_email, 'session_id', v_session.id));
  insert into public.registrations (webinar_id, session_id, email, full_name, phone, company,
    referrer_url, referral_code, status, registration_method)
  values (p_webinar_id, v_session.id, v_email, p_full_name, p_phone, p_company,
    p_referrer_url, p_referral_code, 'registered', 'email') returning * into result;
  perform public.enqueue_reminders_for_registration(result.id);
  return result;
end;
$$;
alter function public.register_for_webinar(uuid, text, text, text, text, text, text) owner to postgres;
grant execute on function public.register_for_webinar(uuid, text, text, text, text, text, text) to anon, authenticated;


create or replace function public.ensure_telegram_registration_is_configured()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'published' and new.registration_method in ('telegram', 'both') and not exists (
    select 1 from public.integration_connections ic
    where ic.account_id = new.account_id and ic.provider = 'telegram' and ic.status = 'active'
      and length(trim(coalesce(ic.config ->> 'bot_username', ''))) > 0
  ) then raise exception 'TELEGRAM_REGISTRATION_NOT_CONFIGURED'; end if;
  return new;
end;
$$;
drop trigger if exists webinars_require_telegram_registration_bot on public.webinars;
create trigger webinars_require_telegram_registration_bot
before insert or update of status, registration_method on public.webinars
for each row execute function public.ensure_telegram_registration_is_configured();

create or replace function public.ensure_funnel_telegram_registration_is_configured()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_account_id uuid; v_webinar_id uuid;
begin
  if new.status <> 'published' then return new; end if;
  select f.account_id, f.webinar_id into v_account_id, v_webinar_id from public.funnels f where f.id = new.id;
  if exists (
    select 1 from public.funnel_pages fp join public.funnel_blocks fb on fb.page_id = fp.id
    where fp.funnel_id = new.id and fb.block_type = 'registration_form'
      and coalesce(fb.content ->> 'registrationMethod', 'inherit') in ('telegram', 'both')
  ) and (v_webinar_id is null or not exists (
    select 1 from public.integration_connections ic where ic.account_id = v_account_id
      and ic.provider = 'telegram' and ic.status = 'active'
      and length(trim(coalesce(ic.config ->> 'bot_username', ''))) > 0
  )) then raise exception 'TELEGRAM_REGISTRATION_NOT_CONFIGURED'; end if;
  return new;
end;
$$;
drop trigger if exists funnels_require_telegram_registration_bot on public.funnels;
create trigger funnels_require_telegram_registration_bot
before update of status on public.funnels for each row
execute function public.ensure_funnel_telegram_registration_is_configured();

-- Expose the webinar default to a published funnel without exposing private account data.
drop function if exists public.get_published_funnel_page(text, text);
create function public.get_published_funnel_page(funnel_slug text, page_path text)
returns table (
  funnel_name text, page_name text, theme jsonb, blocks jsonb, webinar_id uuid,
  webinar_slug text, webinar_scheduled_at timestamptz, webinar_registration_method text
)
language sql stable security definer set search_path = public as $$
  select f.name, p.name, coalesce(p.theme, '{}'::jsonb),
    coalesce(jsonb_agg(to_jsonb(b) order by b.sort_order) filter (where b.id is not null), '[]'::jsonb),
    w.id, w.slug, w.scheduled_at, w.registration_method
  from public.funnels f join public.funnel_pages p on p.funnel_id = f.id
  left join public.funnel_blocks b on b.page_id = p.id
  left join public.webinars w on w.id = f.webinar_id and w.status = 'published'
  where f.slug = funnel_slug and p.path = page_path and f.status = 'published'
  group by f.id, f.name, p.id, p.name, p.theme, w.id, w.slug, w.scheduled_at, w.registration_method
$$;
grant execute on function public.get_published_funnel_page(text, text) to anon, authenticated;

-- Email-only deliveries must never be queued for Telegram-only registrations.
create or replace function public.enqueue_reminders_for_registration(p_registration_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_webinar_id uuid; v_starts_at timestamptz; v_email text; v_registration_method text;
  v_count integer := 0; v_rule record;
begin
  select reg.webinar_id, session.starts_at, reg.email, reg.registration_method
  into v_webinar_id, v_starts_at, v_email, v_registration_method
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  where reg.id = p_registration_id;
  if v_webinar_id is null or v_starts_at is null then return 0; end if;
  for v_rule in
    select rule.id, rule.minutes_before
    from public.reminder_rules rule
    where rule.webinar_id = v_webinar_id and rule.is_enabled
      and (
        (v_registration_method = 'email' and (rule.channel <> 'email' or v_email is not null))
        or (v_registration_method = 'telegram' and rule.channel = 'telegram' and exists (
          select 1 from public.registration_message_channels channel
          where channel.registration_id = p_registration_id
            and channel.integration_connection_id = rule.integration_connection_id
            and channel.provider = 'telegram' and channel.status = 'linked'
        ))
      )
  loop
    if v_starts_at - make_interval(mins => v_rule.minutes_before) >= now() then
      insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
      values (p_registration_id, v_rule.id, v_starts_at - make_interval(mins => v_rule.minutes_before))
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
alter function public.enqueue_reminders_for_registration(uuid) owner to postgres;


-- Keep rule-triggered synchronization from creating undeliverable jobs.
create or replace function public.sync_reminder_rule_queue()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue
    where rule_id = old.id and status = 'queued'::public.reminder_status;
    return old;
  end if;
  if not new.is_enabled or new.channel not in ('email', 'manychat', 'telegram') then
    delete from public.reminder_queue
    where rule_id = new.id and status = 'queued'::public.reminder_status;
    return new;
  end if;
  update public.reminder_queue q
  set scheduled_at = s.starts_at - make_interval(mins => new.minutes_before), updated_at = now()
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    );
  delete from public.reminder_queue q
  using public.registrations r
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and not (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    );
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, s.starts_at - make_interval(mins => new.minutes_before)
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and s.starts_at is not null
    and s.starts_at - make_interval(mins => new.minutes_before) >= now()
    and (
      (r.registration_method = 'email' and (new.channel <> 'email' or r.email is not null))
      or (r.registration_method = 'telegram' and new.channel = 'telegram' and exists (
        select 1 from public.registration_message_channels tc
        where tc.registration_id = r.id and tc.integration_connection_id = new.integration_connection_id
          and tc.provider = 'telegram' and tc.status = 'linked'
      ))
    )
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  return new;
end;
$$;
alter function public.sync_reminder_rule_queue() owner to postgres;
