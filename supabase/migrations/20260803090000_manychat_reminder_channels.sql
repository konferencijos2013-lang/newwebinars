-- Universal ManyChat reminder channel with one secure state record per registration.
-- A separate opaque link token is used for chat linking; webinar access tokens are never exposed to ManyChat.

create table public.registration_message_channels (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null default 'manychat' check (provider = 'manychat'),
  external_subscriber_id text,
  external_channel text check (external_channel in ('messenger', 'instagram', 'whatsapp', 'telegram', 'other')),
  status text not null default 'pending' check (status in ('pending', 'linked', 'unsubscribed', 'invalid', 'blocked')),
  link_token_hash text,
  link_expires_at timestamptz,
  linked_at timestamptz,
  last_delivery_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, integration_connection_id, provider)
);

comment on table public.registration_message_channels is 'Provider-specific attendee messaging state. Raw linking tokens are never stored.';
create index registration_message_channels_connection_subscriber_idx
  on public.registration_message_channels(integration_connection_id, external_subscriber_id)
  where external_subscriber_id is not null;
create index registration_message_channels_registration_status_idx
  on public.registration_message_channels(registration_id, status);
alter table public.registration_message_channels enable row level security;

create table public.manychat_webhook_events (
  id uuid primary key default gen_random_uuid(),
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  event_id text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (integration_connection_id, event_id)
);
comment on table public.manychat_webhook_events is 'Idempotency ledger for verified ManyChat link callbacks.';
alter table public.manychat_webhook_events enable row level security;

create or replace function public.prepare_manychat_channels_for_registration(p_registration_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_webinar_id uuid;
begin
  select webinar_id into v_webinar_id from public.registrations where id = p_registration_id;
  if v_webinar_id is null then return; end if;
  insert into public.registration_message_channels (registration_id, integration_connection_id)
  select p_registration_id, rr.integration_connection_id
  from public.reminder_rules rr
  join public.integration_connections ic on ic.id = rr.integration_connection_id
  where rr.webinar_id = v_webinar_id
    and rr.channel = 'manychat'
    and rr.is_enabled
    and ic.provider = 'manychat'
    and ic.status = 'active'
  on conflict (registration_id, integration_connection_id, provider) do nothing;
end;
$$;

create or replace function public.create_manychat_channels_for_registration_trigger()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  perform public.prepare_manychat_channels_for_registration(new.id);
  return new;
end; $$;

drop trigger if exists registrations_prepare_manychat_channels on public.registrations;
create trigger registrations_prepare_manychat_channels
after insert on public.registrations
for each row execute function public.create_manychat_channels_for_registration_trigger();

-- Creates a one-use 30-minute link code for the attendee. The caller may only
-- authorize this with their own registration access token.
create or replace function public.get_manychat_link_options(p_access_token uuid)
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
  v_template text;
  v_expires timestamptz := now() + interval '30 minutes';
  v_channel record;
begin
  select id into v_registration_id
  from public.registrations
  where access_token = p_access_token and cancelled_at is null;
  if v_registration_id is null then return; end if;

  perform public.prepare_manychat_channels_for_registration(v_registration_id);
  for v_channel in
    select mc.integration_connection_id, mc.status,
      coalesce(ic.config ->> 'link_url_template', '') as link_url_template
    from public.registration_message_channels mc
    join public.integration_connections ic on ic.id = mc.integration_connection_id
    where mc.registration_id = v_registration_id and mc.provider = 'manychat'
      and ic.status = 'active'
  loop
    if v_channel.status = 'linked' then
      integration_connection_id := v_channel.integration_connection_id;
      status := 'linked'; connect_url := null; expires_at := null; return next;
      continue;
    end if;
    if v_channel.link_url_template = '' or position('{{manychat_link_token}}' in v_channel.link_url_template) = 0 then
      continue;
    end if;
    v_token := encode(gen_random_bytes(24), 'hex');
    update public.registration_message_channels
    set link_token_hash = encode(digest(v_token, 'sha256'), 'hex'), link_expires_at = v_expires,
        status = 'pending', last_error = null, updated_at = now()
    where registration_id = v_registration_id and integration_connection_id = v_channel.integration_connection_id and provider = 'manychat';
    integration_connection_id := v_channel.integration_connection_id;
    status := 'pending';
    connect_url := replace(v_channel.link_url_template, '{{manychat_link_token}}', v_token);
    expires_at := v_expires;
    return next;
  end loop;
end;
$$;
revoke all on function public.get_manychat_link_options(uuid) from public;
grant execute on function public.get_manychat_link_options(uuid) to anon, authenticated;

-- Used only by the service-role webhook to attach a ManyChat contact after it
-- has submitted the opaque link token through an account's ManyChat flow.
create or replace function public.link_manychat_subscriber(
  p_connection_id uuid, p_link_token text, p_subscriber_id text, p_channel text default 'other'
)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_state public.registration_message_channels;
begin
  if length(trim(coalesce(p_link_token, ''))) < 32 or length(trim(coalesce(p_subscriber_id, ''))) = 0 then
    raise exception 'Invalid linking payload';
  end if;
  select * into v_state from public.registration_message_channels
  where integration_connection_id = p_connection_id and provider = 'manychat'
    and link_token_hash = encode(digest(p_link_token, 'sha256'), 'hex')
    and link_expires_at > now()
  for update;
  if v_state.id is null then return 'invalid_or_expired'; end if;
  if v_state.status = 'linked' then return 'already_linked'; end if;
  update public.registration_message_channels
  set external_subscriber_id = trim(p_subscriber_id),
      external_channel = case when p_channel in ('messenger', 'instagram', 'whatsapp', 'telegram') then p_channel else 'other' end,
      status = 'linked', linked_at = now(), link_token_hash = null, link_expires_at = null,
      last_error = null, updated_at = now()
  where id = v_state.id;
  return 'linked';
end;
$$;
revoke all on function public.link_manychat_subscriber(uuid, text, text, text) from public;
grant execute on function public.link_manychat_subscriber(uuid, text, text, text) to service_role;

-- Newly created/edited ManyChat rules must also prepare states for people who
-- have already registered, without duplicating them.
create or replace function public.sync_manychat_channel_states()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.channel = 'manychat' and new.is_enabled and new.integration_connection_id is not null then
    insert into public.registration_message_channels (registration_id, integration_connection_id)
    select r.id, new.integration_connection_id from public.registrations r
    where r.webinar_id = new.webinar_id and r.cancelled_at is null
    on conflict (registration_id, integration_connection_id, provider) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists reminder_rules_manychat_states on public.reminder_rules;
create trigger reminder_rules_manychat_states
after insert or update of channel, is_enabled, integration_connection_id, webinar_id on public.reminder_rules
for each row execute function public.sync_manychat_channel_states();

-- Include linked state in the existing worker claim payload.
drop function if exists public.claim_due_reminders(integer);
create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  queue_id uuid, registration_id uuid, rule_id uuid, retry_count integer,
  email text, full_name text, webinar_title text, webinar_slug text, access_token uuid, public_hostname text,
  subject text, body text, channel text, connection_id uuid, provider public.integration_provider,
  provider_config jsonb, manychat_subscriber_id text, manychat_channel_status text
)
language plpgsql security definer set search_path = public
as $$
begin
  update public.reminder_queue set status = 'queued'::public.reminder_status, scheduled_at = now(),
    error_message = coalesce(error_message, 'Delivery worker timed out; retrying.'), updated_at = now()
  where status = 'processing'::public.reminder_status and updated_at < now() - interval '10 minutes';
  return query
  with due as (
    select q.id from public.reminder_queue q
    join public.reminder_rules rr on rr.id = q.rule_id
    join public.integration_connections ic on ic.id = rr.integration_connection_id and ic.status = 'active'
    where q.status = 'queued'::public.reminder_status and q.scheduled_at <= now() and q.retry_count < 5
    order by q.scheduled_at, q.created_at for update of q skip locked limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.reminder_queue q set status = 'processing'::public.reminder_status, updated_at = now()
    from due where q.id = due.id returning q.id, q.registration_id, q.rule_id, q.retry_count
  )
  select c.id, c.registration_id, c.rule_id, c.retry_count, r.email, r.full_name, w.title, w.slug, r.access_token,
    coalesce(case when a.custom_domain_status = 'verified' then a.custom_domain end, a.public_subdomain || '.newwebinars.com', 'newwebinars.com'),
    rr.subject, rr.body, rr.channel, ic.id, ic.provider, ic.config,
    mc.external_subscriber_id, mc.status
  from claimed c join public.registrations r on r.id = c.registration_id
  join public.webinars w on w.id = r.webinar_id join public.accounts a on a.id = w.account_id
  join public.reminder_rules rr on rr.id = c.rule_id join public.integration_connections ic on ic.id = rr.integration_connection_id
  left join public.registration_message_channels mc on mc.registration_id = r.id and mc.integration_connection_id = ic.id and mc.provider = 'manychat';
end; $$;
revoke all on function public.claim_due_reminders(integer) from public;
grant execute on function public.claim_due_reminders(integer) to service_role;

create or replace function public.complete_reminder_delivery(
  p_queue_id uuid, p_status public.reminder_log_status, p_provider_response text default null, p_error_message text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare v_queue public.reminder_queue;
begin
  update public.reminder_queue set
    retry_count = case when p_status = 'failed' then retry_count + 1 else retry_count end,
    status = case when p_status = 'sent' then 'sent'::public.reminder_status
      when p_status = 'skipped' then 'skipped'::public.reminder_status
      when retry_count + 1 >= 5 then 'failed'::public.reminder_status else 'queued'::public.reminder_status end,
    sent_at = case when p_status = 'sent' then now() else null end,
    failed_at = case when p_status = 'failed' and retry_count + 1 >= 5 then now() else null end,
    error_message = p_error_message, updated_at = now()
  where id = p_queue_id and status = 'processing' returning * into v_queue;
  if v_queue.id is not null then
    insert into public.reminder_logs(queue_id, registration_id, rule_id, status, provider_response)
    values (v_queue.id, v_queue.registration_id, v_queue.rule_id, p_status, p_provider_response);
  end if;
end; $$;
revoke all on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) from public;
grant execute on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) to service_role;

-- Both email and ManyChat rules schedule durable queue work.
create or replace function public.sync_reminder_rule_queue()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue where rule_id = old.id and status = 'queued'::public.reminder_status; return old;
  end if;
  if not new.is_enabled or new.channel not in ('email', 'manychat') then
    delete from public.reminder_queue where rule_id = new.id and status = 'queued'::public.reminder_status; return new;
  end if;
  update public.reminder_queue q set scheduled_at = w.scheduled_at - make_interval(mins => new.minutes_before), updated_at = now()
  from public.registrations r join public.webinars w on w.id = r.webinar_id
  where q.rule_id = new.id and q.registration_id = r.id and q.status = 'queued'::public.reminder_status and w.scheduled_at is not null;
  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, w.scheduled_at - make_interval(mins => new.minutes_before)
  from public.registrations r join public.webinars w on w.id = r.webinar_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and w.scheduled_at is not null
    and w.scheduled_at - make_interval(mins => new.minutes_before) >= now()
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;
  return new;
end; $$;
