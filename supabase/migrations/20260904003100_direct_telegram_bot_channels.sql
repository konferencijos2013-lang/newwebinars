-- Direct Telegram Bot API integration: secure attendee linking, contact storage,
-- and reminder delivery through the existing durable queue.

alter table public.registration_message_channels
  drop constraint if exists registration_message_channels_provider_check;
alter table public.registration_message_channels
  add constraint registration_message_channels_provider_check
  check (provider in ('manychat', 'telegram'));

alter table public.registration_message_channels
  add column if not exists telegram_contact_id uuid;

create table public.telegram_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  chat_id text not null,
  telegram_user_id text,
  username text,
  first_name text,
  last_name text,
  language_code text,
  status text not null default 'active' check (status in ('active', 'blocked', 'unsubscribed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, chat_id)
);

alter table public.registration_message_channels
  add constraint registration_message_channels_telegram_contact_id_fkey
  foreign key (telegram_contact_id) references public.telegram_contacts(id) on delete set null;

create index telegram_contacts_account_id_idx on public.telegram_contacts(account_id);
alter table public.telegram_contacts enable row level security;
grant select on public.telegram_contacts to authenticated;
create policy "Telegram contacts: account admins can view"
  on public.telegram_contacts for select to authenticated
  using (public.has_account_role(account_id, array['owner', 'admin']) or public.is_platform_admin());

create table public.telegram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  update_id bigint not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (integration_connection_id, update_id)
);
alter table public.telegram_webhook_events enable row level security;

create or replace function public.prepare_telegram_channels_for_registration(p_registration_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_webinar_id uuid;
begin
  select webinar_id into v_webinar_id from public.registrations where id = p_registration_id;
  if v_webinar_id is null then return; end if;
  insert into public.registration_message_channels (
    registration_id, integration_connection_id, provider
  )
  select p_registration_id, rr.integration_connection_id, 'telegram'
  from public.reminder_rules rr
  join public.integration_connections ic on ic.id = rr.integration_connection_id
  where rr.webinar_id = v_webinar_id
    and rr.channel = 'telegram'
    and rr.is_enabled
    and ic.provider = 'telegram'
    and ic.status = 'active'
  on conflict (registration_id, integration_connection_id, provider) do nothing;
end;
$$;

create or replace function public.create_telegram_channels_for_registration_trigger()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  perform public.prepare_telegram_channels_for_registration(new.id);
  return new;
end; $$;

drop trigger if exists registrations_prepare_telegram_channels on public.registrations;
create trigger registrations_prepare_telegram_channels
after insert on public.registrations
for each row execute function public.create_telegram_channels_for_registration_trigger();

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
    select mc.integration_connection_id, mc.status,
      coalesce(ic.config ->> 'bot_username', '') as bot_username
    from public.registration_message_channels mc
    join public.integration_connections ic on ic.id = mc.integration_connection_id
    where mc.registration_id = v_registration_id
      and mc.provider = 'telegram'
      and ic.provider = 'telegram'
      and ic.status = 'active'
  loop
    integration_connection_id := v_channel.integration_connection_id;
    if v_channel.status = 'linked' then
      status := 'linked'; connect_url := null; expires_at := null; return next;
      continue;
    end if;
    if v_channel.bot_username = '' then continue; end if;

    -- Telegram start parameters permit at most 64 base64url-compatible chars.
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.registration_message_channels
    set link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
        link_expires_at = v_expires,
        status = 'pending', last_error = null, updated_at = now()
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
    username, first_name, last_name, language_code
  ) values (
    v_account_id, p_connection_id, trim(p_chat_id), nullif(trim(p_telegram_user_id), ''),
    nullif(trim(p_username), ''), nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''), nullif(trim(p_language_code), '')
  )
  on conflict (integration_connection_id, chat_id) do update set
    telegram_user_id = coalesce(excluded.telegram_user_id, telegram_contacts.telegram_user_id),
    username = coalesce(excluded.username, telegram_contacts.username),
    first_name = coalesce(excluded.first_name, telegram_contacts.first_name),
    last_name = coalesce(excluded.last_name, telegram_contacts.last_name),
    language_code = coalesce(excluded.language_code, telegram_contacts.language_code),
    status = 'active', last_seen_at = now(), updated_at = now()
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

create or replace function public.sync_telegram_channel_states()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.channel = 'telegram' and new.is_enabled and new.integration_connection_id is not null then
    insert into public.registration_message_channels (
      registration_id, integration_connection_id, provider
    )
    select r.id, new.integration_connection_id, 'telegram'
    from public.registrations r
    join public.integration_connections ic on ic.id = new.integration_connection_id
    where r.webinar_id = new.webinar_id and r.cancelled_at is null
      and ic.provider = 'telegram' and ic.status = 'active'
    on conflict (registration_id, integration_connection_id, provider) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists reminder_rules_telegram_states on public.reminder_rules;
create trigger reminder_rules_telegram_states
after insert or update of channel, is_enabled, integration_connection_id, webinar_id on public.reminder_rules
for each row execute function public.sync_telegram_channel_states();

-- Session-aware queue synchronization, now including direct Telegram rules.
create or replace function public.sync_reminder_rule_queue()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue where rule_id = old.id and status = 'queued'::public.reminder_status;
    return old;
  end if;
  if not new.is_enabled or new.channel not in ('email', 'manychat', 'telegram') then
    delete from public.reminder_queue where rule_id = new.id and status = 'queued'::public.reminder_status;
    return new;
  end if;
  update public.reminder_queue q
  set scheduled_at = s.starts_at - make_interval(mins => new.minutes_before), updated_at = now()
  from public.registrations r join public.webinar_sessions s on s.id = r.session_id
  where q.rule_id = new.id and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status;
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, s.starts_at - make_interval(mins => new.minutes_before)
  from public.registrations r join public.webinar_sessions s on s.id = r.session_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and s.starts_at is not null
    and s.starts_at - make_interval(mins => new.minutes_before) >= now()
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  return new;
end;
$$;

-- Add the linked Telegram chat to the worker's claimed-job payload.
drop function if exists public.claim_due_reminders(integer);
create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  queue_id uuid, registration_id uuid, rule_id uuid, retry_count integer,
  email text, full_name text, webinar_title text, webinar_slug text, access_token uuid, public_hostname text,
  subject text, body text, channel text, connection_id uuid, provider public.integration_provider,
  provider_config jsonb, manychat_subscriber_id text, manychat_channel_status text,
  telegram_chat_id text, telegram_channel_status text
)
language plpgsql security definer set search_path = public
as $$
begin
  update public.reminder_queue
  set status = 'queued'::public.reminder_status, scheduled_at = now(),
      error_message = coalesce(error_message, 'Delivery worker timed out; retrying.'), updated_at = now()
  where status = 'processing'::public.reminder_status and updated_at < now() - interval '10 minutes';
  return query
  with due as (
    select q.id from public.reminder_queue q
    join public.reminder_rules rr on rr.id = q.rule_id
    join public.integration_connections ic on ic.id = rr.integration_connection_id and ic.status = 'active'
    where q.status = 'queued'::public.reminder_status and q.scheduled_at <= now() and q.retry_count < 5
    order by q.scheduled_at, q.created_at for update of q skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.reminder_queue q set status = 'processing'::public.reminder_status, updated_at = now()
    from due where q.id = due.id returning q.id, q.registration_id, q.rule_id, q.retry_count
  )
  select c.id, c.registration_id, c.rule_id, c.retry_count,
    r.email, r.full_name, w.title, w.slug, r.access_token,
    coalesce(case when a.custom_domain_status = 'verified' then a.custom_domain end,
      a.public_subdomain || '.newwebinars.com', 'newwebinars.com'),
    rr.subject, rr.body, rr.channel, ic.id, ic.provider, ic.config,
    mc.external_subscriber_id, mc.status,
    tc.external_subscriber_id, tc.status
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.webinars w on w.id = r.webinar_id
  join public.accounts a on a.id = w.account_id
  join public.reminder_rules rr on rr.id = c.rule_id
  join public.integration_connections ic on ic.id = rr.integration_connection_id
  left join public.registration_message_channels mc
    on mc.registration_id = r.id and mc.integration_connection_id = ic.id and mc.provider = 'manychat'
  left join public.registration_message_channels tc
    on tc.registration_id = r.id and tc.integration_connection_id = ic.id and tc.provider = 'telegram';
end;
$$;
revoke all on function public.claim_due_reminders(integer) from public;
grant execute on function public.claim_due_reminders(integer) to service_role;
