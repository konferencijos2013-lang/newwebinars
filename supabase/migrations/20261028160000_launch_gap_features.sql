-- Analytics progress, post-event reminders, access control, partner cabinet, and team invites.

alter table public.registrations
  add column if not exists payment_required boolean not null default false,
  add column if not exists paid_at timestamptz;

alter table public.reminder_rules
  add column if not exists timing text not null default 'before_start';
alter table public.reminder_rules drop constraint if exists reminder_rules_timing_check;
alter table public.reminder_rules
  add constraint reminder_rules_timing_check
  check (timing in ('before_start', 'after_end'));

create table if not exists public.webinar_invites (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  email text not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (webinar_id, email)
);
create index if not exists idx_webinar_invites_webinar on public.webinar_invites (webinar_id);
alter table public.webinar_invites enable row level security;
drop policy if exists "Webinar invites: account members manage" on public.webinar_invites;
create policy "Webinar invites: account members manage"
  on public.webinar_invites
  for all
  to authenticated
  using (
    exists (
      select 1 from public.webinars w
      where w.id = webinar_id and public.is_account_member(w.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.webinars w
      where w.id = webinar_id and public.is_account_member(w.account_id)
    )
  );
grant select, insert, update, delete on public.webinar_invites to authenticated;

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  email text not null,
  role text not null check (role in ('host', 'viewer')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, email)
);
create index if not exists idx_account_invitations_account on public.account_invitations (account_id);
alter table public.account_invitations enable row level security;
drop policy if exists "Account invitations: members can view" on public.account_invitations;
create policy "Account invitations: members can view"
  on public.account_invitations
  for select
  to authenticated
  using (public.is_account_member(account_id));
grant select on public.account_invitations to authenticated;

create or replace function public.reminder_run_at(
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_timing text,
  p_offset_minutes integer
) returns timestamptz
language sql
immutable
as $$
  select case
    when p_timing = 'after_end' then
      p_starts_at
        + make_interval(mins => greatest(coalesce(p_duration_minutes, 0), 0))
        + make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
    else
      p_starts_at - make_interval(mins => greatest(coalesce(p_offset_minutes, 0), 0))
  end;
$$;
revoke all on function public.reminder_run_at(timestamptz, integer, text, integer) from public;

create or replace function public.set_webinar_password(p_webinar_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not permitted';
  end if;
  select account_id into v_account_id from public.webinars where id = p_webinar_id;
  if v_account_id is null or not public.is_account_member(v_account_id) then
    raise exception 'Not permitted';
  end if;
  if p_password is null or length(trim(p_password)) < 4 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  update public.webinars
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_webinar_id;
end;
$$;
revoke all on function public.set_webinar_password(uuid, text) from public;
grant execute on function public.set_webinar_password(uuid, text) to authenticated;

create or replace function public.assert_registration_access(
  p_webinar_id uuid,
  p_email text,
  p_password text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_webinar public.webinars;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  select * into v_webinar from public.webinars where id = p_webinar_id;
  if v_webinar.id is null then
    raise exception 'Webinar is not available for registration';
  end if;
  if v_webinar.access_mode = 'password_protected' then
    if v_webinar.password_hash is null
      or p_password is null
      or extensions.crypt(p_password, v_webinar.password_hash) <> v_webinar.password_hash then
      raise exception 'ACCESS_PASSWORD_INVALID';
    end if;
  elsif v_webinar.access_mode = 'invited_only' then
    if v_email is null or not exists (
      select 1 from public.webinar_invites invite
      where invite.webinar_id = p_webinar_id and invite.email = v_email
    ) then
      raise exception 'ACCESS_NOT_INVITED';
    end if;
  elsif v_webinar.access_mode = 'paid_access' then
    if coalesce(v_webinar.price_cents, 0) <= 0 then
      raise exception 'ACCESS_PRICE_REQUIRED';
    end if;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.assert_registration_access(uuid, text, text) from public;

drop function if exists public.register_for_webinar(uuid, text, text, text, text, text, text);
create function public.register_for_webinar(
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
  v_session := public.resolve_webinar_session(p_webinar_id);
  if not public.is_webinar_open_for_registration(p_webinar_id, v_session.id) then
    raise exception 'Webinar session is not open for registration or has reached its participant limit';
  end if;
  if p_referral_code is not null and not public.is_active_partner_code(p_referral_code) then
    raise exception 'Invalid referral code';
  end if;
  if exists (
    select 1 from public.registrations
    where session_id = v_session.id and lower(email) = v_email and cancelled_at is null
  ) then
    raise exception 'You are already registered for this webinar session';
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

drop function if exists public.start_telegram_webinar_registration(uuid, text, text, text);
create function public.start_telegram_webinar_registration(
  p_webinar_id uuid,
  p_full_name text default null,
  p_referrer_url text default null,
  p_referral_code text default null,
  p_password text default null
)
returns table (intent_id uuid, connect_url text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
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
  if v_webinar.access_mode = 'invited_only' then
    raise exception 'ACCESS_NOT_INVITED';
  end if;
  perform public.assert_registration_access(p_webinar_id, null, p_password);
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
revoke all on function public.start_telegram_webinar_registration(uuid, text, text, text, text) from public;
grant execute on function public.start_telegram_webinar_registration(uuid, text, text, text, text) to anon, authenticated;

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
  where r.session_id = v_intent.session_id and r.telegram_contact_id = v_contact_id and r.cancelled_at is null;
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

create or replace function public.enqueue_reminders_for_registration(p_registration_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webinar_id uuid;
  v_starts_at timestamptz;
  v_duration integer;
  v_email text;
  v_registration_method text;
  v_count integer := 0;
  v_rule record;
  v_run_at timestamptz;
begin
  select reg.webinar_id, session.starts_at, webinar.duration_minutes, reg.email, reg.registration_method
  into v_webinar_id, v_starts_at, v_duration, v_email, v_registration_method
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  left join public.webinars webinar on webinar.id = reg.webinar_id
  where reg.id = p_registration_id;
  if v_webinar_id is null or v_starts_at is null then return 0; end if;
  for v_rule in
    select rule.id, rule.minutes_before, rule.timing
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
    v_run_at := public.reminder_run_at(v_starts_at, v_duration, v_rule.timing, v_rule.minutes_before);
    if v_run_at >= now() then
      insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
      values (p_registration_id, v_rule.id, v_run_at)
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
alter function public.enqueue_reminders_for_registration(uuid) owner to postgres;

create or replace function public.sync_reminder_rule_queue()
returns trigger
language plpgsql
security definer
set search_path = public
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
  set scheduled_at = public.reminder_run_at(s.starts_at, w.duration_minutes, new.timing, new.minutes_before),
      updated_at = now()
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  join public.webinars w on w.id = r.webinar_id
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
  select r.id, new.id, public.reminder_run_at(s.starts_at, w.duration_minutes, new.timing, new.minutes_before)
  from public.registrations r
  join public.webinar_sessions s on s.id = r.session_id
  join public.webinars w on w.id = r.webinar_id
  where r.webinar_id = new.webinar_id and r.cancelled_at is null and s.starts_at is not null
    and public.reminder_run_at(s.starts_at, w.duration_minutes, new.timing, new.minutes_before) >= now()
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

drop trigger if exists reminder_rules_queue_sync on public.reminder_rules;
create trigger reminder_rules_queue_sync
after insert or update of minutes_before, timing, is_enabled, channel, webinar_id or delete
on public.reminder_rules
for each row execute function public.sync_reminder_rule_queue();

create or replace function public.mark_registration_joined_webinar(p_access_token uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  update public.registrations
  set joined_webinar_at = coalesce(joined_webinar_at, now()),
      joined_at = coalesce(joined_at, now()),
      status = case when status = 'registered' then 'attended' else status end
  where access_token = p_access_token
    and removed_from_webinar_at is null
    and (payment_required = false or paid_at is not null)
  returning * into result;
  return result;
end;
$$;
alter function public.mark_registration_joined_webinar(uuid) owner to postgres;

create or replace function public.record_attendee_progress(
  p_access_token uuid,
  p_watch_seconds integer default null,
  p_offer_clicked boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registrations
  set watch_time_seconds = greatest(
        watch_time_seconds,
        least(greatest(coalesce(p_watch_seconds, 0), 0), 86400)
      ),
      attended_seconds = greatest(
        attended_seconds,
        least(greatest(coalesce(p_watch_seconds, 0), 0), 86400)
      ),
      joined_webinar_at = case
        when coalesce(p_watch_seconds, 0) > 0 then coalesce(joined_webinar_at, now())
        else joined_webinar_at
      end,
      joined_at = case
        when coalesce(p_watch_seconds, 0) > 0 then coalesce(joined_at, now())
        else joined_at
      end,
      offer_clicked_at = case
        when p_offer_clicked then coalesce(offer_clicked_at, now())
        else offer_clicked_at
      end,
      updated_at = now()
  where access_token = p_access_token
    and removed_from_webinar_at is null
    and (payment_required = false or paid_at is not null);
end;
$$;
revoke all on function public.record_attendee_progress(uuid, integer, boolean) from public;
grant execute on function public.record_attendee_progress(uuid, integer, boolean) to anon, authenticated;

drop function if exists public.get_published_funnel_page(text, text);
create function public.get_published_funnel_page(funnel_slug text, page_path text)
returns table (
  funnel_name text,
  page_name text,
  theme jsonb,
  blocks jsonb,
  webinar_id uuid,
  webinar_slug text,
  webinar_scheduled_at timestamptz,
  webinar_registration_method text,
  webinar_access_mode text,
  webinar_price_cents integer
)
language sql
stable
security definer
set search_path = public
as $$
  select f.name, p.name, coalesce(p.theme, '{}'::jsonb),
    coalesce(jsonb_agg(to_jsonb(b) order by b.sort_order) filter (where b.id is not null), '[]'::jsonb),
    w.id, w.slug, w.scheduled_at, w.registration_method, w.access_mode, w.price_cents
  from public.funnels f
  join public.funnel_pages p on p.funnel_id = f.id
  left join public.funnel_blocks b on b.page_id = p.id
  left join public.webinars w on w.id = f.webinar_id and w.status = 'published'
  where f.slug = funnel_slug and p.path = page_path and f.status = 'published'
  group by f.id, f.name, p.id, p.name, p.theme, w.id, w.slug, w.scheduled_at,
    w.registration_method, w.access_mode, w.price_cents;
$$;
grant execute on function public.get_published_funnel_page(text, text) to anon, authenticated;

create or replace function public.get_my_affiliate_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_partner public.partners;
  v_clicks integer;
  v_signups integer;
  v_conversions integer;
  v_earned integer;
  v_payable integer;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('status', 'none');
  end if;
  select * into v_partner
  from public.partners
  where type = 'affiliate'
    and application_status = 'approved'
    and is_active = true
    and lower(email) = v_email
  order by approved_at desc nulls last
  limit 1;
  if v_partner.id is null then
    return jsonb_build_object('status', 'none');
  end if;
  select count(*) into v_clicks from public.platform_partner_clicks where partner_id = v_partner.id;
  select count(*) into v_signups
  from public.platform_partner_attributions
  where partner_id = v_partner.id and account_id is not null;
  select count(*) into v_conversions
  from public.affiliate_commissions
  where partner_id = v_partner.id and source_type = 'payment' and status <> 'reversed';
  select coalesce(sum(amount_cents), 0) into v_earned
  from public.affiliate_commissions
  where partner_id = v_partner.id and source_type = 'payment' and status <> 'reversed';
  select coalesce(sum(amount_cents), 0) into v_payable
  from public.affiliate_commissions
  where partner_id = v_partner.id and status = 'available';
  return jsonb_build_object(
    'status', 'ready',
    'name', v_partner.name,
    'code', v_partner.code,
    'clicks', v_clicks,
    'signups', v_signups,
    'conversions', v_conversions,
    'earned_cents', v_earned,
    'payable_cents', v_payable,
    'commission_rate_bps', v_partner.commission_rate_bps
  );
end;
$$;
revoke all on function public.get_my_affiliate_dashboard() from public;
grant execute on function public.get_my_affiliate_dashboard() to authenticated;

create or replace function public.invite_account_member(
  p_account_id uuid,
  p_email text,
  p_role text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_plan public.credit_plans;
  v_max integer;
  v_used integer;
  v_token uuid;
begin
  if auth.uid() is null or not public.has_account_role(p_account_id, array['owner', 'admin']) then
    raise exception 'Not permitted';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_role not in ('host', 'viewer') then
    raise exception 'INVALID_ROLE';
  end if;
  if exists (
    select 1
    from public.account_members member
    join public.profiles profile on profile.id = member.user_id
    where member.account_id = p_account_id and lower(profile.email) = v_email
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;
  select * into v_plan from public.current_credit_plan_for_account(p_account_id);
  v_max := nullif(v_plan.limits ->> 'max_team_members', '')::integer;
  select
    (select count(*) from public.account_members where account_id = p_account_id)
    + (select count(*) from public.account_invitations
       where account_id = p_account_id and accepted_at is null and expires_at > now()
         and email <> v_email)
  into v_used;
  if v_max is not null and v_used >= v_max then
    raise exception 'PLAN_TEAM_MEMBER_LIMIT_EXCEEDED';
  end if;
  insert into public.account_invitations (account_id, email, role, invited_by, expires_at, accepted_at)
  values (p_account_id, v_email, p_role, auth.uid(), now() + interval '14 days', null)
  on conflict (account_id, email) do update
    set role = excluded.role,
        token = gen_random_uuid(),
        invited_by = excluded.invited_by,
        expires_at = excluded.expires_at,
        accepted_at = null
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.invite_account_member(uuid, text, text) from public;
grant execute on function public.invite_account_member(uuid, text, text) to authenticated;

create or replace function public.revoke_account_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.account_invitations where id = p_invitation_id;
  if v_account_id is null or not public.has_account_role(v_account_id, array['owner', 'admin']) then
    raise exception 'Not permitted';
  end if;
  delete from public.account_invitations
  where id = p_invitation_id and accepted_at is null;
end;
$$;
revoke all on function public.revoke_account_invitation(uuid) from public;
grant execute on function public.revoke_account_invitation(uuid) to authenticated;

create or replace function public.remove_account_member(p_account_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.has_account_role(p_account_id, array['owner', 'admin']) then
    raise exception 'Not permitted';
  end if;
  select role into v_role from public.account_members
  where account_id = p_account_id and user_id = p_user_id;
  if v_role is null or v_role = 'owner' or p_user_id = auth.uid() then
    raise exception 'Not permitted';
  end if;
  delete from public.account_members
  where account_id = p_account_id and user_id = p_user_id;
end;
$$;
revoke all on function public.remove_account_member(uuid, uuid) from public;
grant execute on function public.remove_account_member(uuid, uuid) to authenticated;

create or replace function public.accept_account_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.account_invitations;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Not permitted';
  end if;
  select * into v_invite from public.account_invitations where token = p_token for update;
  if v_invite.id is null or v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if v_invite.email <> v_email then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;
  if v_invite.accepted_at is null then
    insert into public.account_members (account_id, user_id, role)
    values (v_invite.account_id, auth.uid(), v_invite.role)
    on conflict (account_id, user_id) do nothing;
    update public.account_invitations set accepted_at = now() where id = v_invite.id;
  end if;
  return v_invite.account_id;
end;
$$;
revoke all on function public.accept_account_invitation(uuid) from public;
grant execute on function public.accept_account_invitation(uuid) to authenticated;

create or replace function public.list_account_team(p_account_id uuid)
returns table (
  kind text,
  id uuid,
  email text,
  role text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_account_member(p_account_id) then
    raise exception 'Not permitted';
  end if;
  return query
  select 'member'::text, member.user_id, profile.email, member.role, null::timestamptz
  from public.account_members member
  left join public.profiles profile on profile.id = member.user_id
  where member.account_id = p_account_id
  union all
  select 'invite'::text, invite.id, invite.email, invite.role, invite.expires_at
  from public.account_invitations invite
  where invite.account_id = p_account_id
    and invite.accepted_at is null
    and invite.expires_at > now();
end;
$$;
revoke all on function public.list_account_team(uuid) from public;
grant execute on function public.list_account_team(uuid) to authenticated;
