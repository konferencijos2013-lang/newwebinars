-- Configurable, rate-limited AI replies for private Telegram bot messages.
create table public.telegram_ai_reply_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  chat_id_hash text not null,
  telegram_update_id bigint not null,
  status text not null check (status in ('started', 'replied', 'fallback', 'rate_limited', 'failed')),
  tokens_used integer check (tokens_used is null or tokens_used >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (integration_connection_id, telegram_update_id)
);

create index telegram_ai_reply_events_rate_limit_idx
  on public.telegram_ai_reply_events(integration_connection_id, chat_id_hash, created_at desc);
create index telegram_ai_reply_events_account_idx
  on public.telegram_ai_reply_events(account_id, created_at desc);

alter table public.telegram_ai_reply_events enable row level security;
-- Message text and Telegram identifiers are deliberately not stored here.

create or replace function public.update_telegram_ai_settings(
  p_connection_id uuid,
  p_enabled boolean,
  p_system_prompt text,
  p_welcome_message text,
  p_fallback_message text
)
returns public.integration_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.integration_connections;
  v_prompt text := trim(coalesce(p_system_prompt, ''));
  v_welcome text := trim(coalesce(p_welcome_message, ''));
  v_fallback text := trim(coalesce(p_fallback_message, ''));
begin
  select * into v_connection
  from public.integration_connections
  where id = p_connection_id and provider = 'telegram'
  for update;

  if v_connection.id is null then
    raise exception 'Telegram integration not found';
  end if;
  if auth.uid() is null or not (
    public.has_account_role(v_connection.account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized to manage Telegram AI settings';
  end if;
  if p_enabled and length(v_prompt) < 20 then
    raise exception 'AI system prompt must contain at least 20 characters';
  end if;
  if length(v_prompt) > 12000 then raise exception 'AI system prompt is too long'; end if;
  if length(v_welcome) > 4096 then raise exception 'Welcome message is too long'; end if;
  if length(v_fallback) > 4096 then raise exception 'Fallback message is too long'; end if;

  update public.integration_connections
  set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
        'ai_reply_enabled', coalesce(p_enabled, false),
        'ai_system_prompt', v_prompt,
        'ai_welcome_message', v_welcome,
        'ai_fallback_message', v_fallback
      ),
      updated_at = now()
  where id = p_connection_id
  returning * into v_connection;

  return v_connection;
end;
$$;

revoke all on function public.update_telegram_ai_settings(uuid, boolean, text, text, text) from public;
grant execute on function public.update_telegram_ai_settings(uuid, boolean, text, text, text) to authenticated;

-- Atomically admits one reply request and applies per-chat limits. The
-- advisory lock prevents concurrent webhook deliveries from bypassing them.
create or replace function public.begin_telegram_ai_reply(
  p_connection_id uuid,
  p_chat_id_hash text,
  p_telegram_update_id bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_recent_count integer;
  v_daily_count integer;
  v_status text;
begin
  if length(p_chat_id_hash) <> 64 or p_chat_id_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid chat hash';
  end if;

  select account_id into v_account_id
  from public.integration_connections
  where id = p_connection_id and provider = 'telegram' and status = 'active';
  if v_account_id is null then raise exception 'Telegram integration unavailable'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_connection_id::text || ':' || p_chat_id_hash, 0));

  if exists (
    select 1 from public.telegram_ai_reply_events
    where integration_connection_id = p_connection_id
      and telegram_update_id = p_telegram_update_id
  ) then
    return 'duplicate';
  end if;

  select count(*) filter (where created_at >= now() - interval '10 minutes'),
         count(*) filter (where created_at >= now() - interval '24 hours')
  into v_recent_count, v_daily_count
  from public.telegram_ai_reply_events
  where integration_connection_id = p_connection_id
    and chat_id_hash = p_chat_id_hash
    and created_at >= now() - interval '24 hours';

  v_status := case
    when v_recent_count >= 10 or v_daily_count >= 100 then 'rate_limited'
    else 'started'
  end;

  insert into public.telegram_ai_reply_events (
    account_id, integration_connection_id, chat_id_hash, telegram_update_id,
    status, completed_at
  ) values (
    v_account_id, p_connection_id, p_chat_id_hash, p_telegram_update_id,
    v_status, case when v_status = 'rate_limited' then now() else null end
  );

  return v_status;
end;
$$;

revoke all on function public.begin_telegram_ai_reply(uuid, text, bigint) from public;
grant execute on function public.begin_telegram_ai_reply(uuid, text, bigint) to service_role;
