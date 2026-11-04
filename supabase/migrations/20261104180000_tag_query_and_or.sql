-- Tag broadcast filters: a list of has/lacks conditions combined with AND (all) or OR (any).
-- Explicit contact ids still define the audience by themselves.

create or replace function public.contact_has_tag(
  p_kind text,
  p_contact_id uuid,
  p_tag_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case p_kind
    when 'email' then exists (
      select 1
      from public.email_contact_tags
      where email_contact_id = p_contact_id
        and tag_id = p_tag_id
    )
    when 'telegram' then exists (
      select 1
      from public.telegram_contact_tags
      where telegram_contact_id = p_contact_id
        and tag_id = p_tag_id
    )
    else false
  end;
$$;

create or replace function public.contact_matches_tag_query(
  p_kind text,
  p_contact_id uuid,
  p_conditions jsonb,
  p_match text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_conditions is null
      or p_conditions = 'null'::jsonb
      or p_conditions = '[]'::jsonb then true
    when jsonb_typeof(p_conditions) <> 'array' then false
    else coalesce((
      select case
        when p_match = 'any' then bool_or(matched)
        else bool_and(matched)
      end
      from (
        select public.contact_has_tag(p_kind, p_contact_id, condition.tag_id)
          = condition.present as matched
        from jsonb_to_recordset(p_conditions) as condition(tag_id uuid, present boolean)
      ) checks
    ), false)
  end;
$$;

create or replace function public.assert_tag_query(
  p_account_id uuid,
  p_conditions jsonb,
  p_match text
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_conditions is null or p_conditions = 'null'::jsonb or p_conditions = '[]'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_conditions) <> 'array' then
    raise exception 'Invalid tag query';
  end if;
  v_count := jsonb_array_length(p_conditions);
  if v_count > 20 then
    raise exception 'Too many tags';
  end if;
  if p_match is not null and p_match not in ('all', 'any') then
    raise exception 'Invalid tag match';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_conditions) element
    where jsonb_typeof(element) <> 'object'
      or coalesce(element->>'tag_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(element->'present') <> 'boolean'
  ) then
    raise exception 'Invalid tag query';
  end if;
  if (
    select count(*)
    from (
      select distinct element->>'tag_id'
      from jsonb_array_elements(p_conditions) element
    ) distinct_tags
  ) <> v_count then
    raise exception 'Duplicate tag';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_conditions) element
    where not exists (
      select 1
      from public.contact_tags tag
      where tag.id = (element->>'tag_id')::uuid
        and tag.account_id = p_account_id
    )
  ) then
    raise exception 'Unknown tag';
  end if;
end;
$$;

drop function if exists public.search_email_contacts(uuid, text, uuid[], uuid[], integer, integer);

create function public.search_email_contacts(
  p_account_id uuid,
  p_search text default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := left(regexp_replace(lower(trim(coalesce(p_search, ''))), '[%_]', '', 'g'), 100);
begin
  if not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);
  return (
    with filtered as (
      select contact.*
      from public.email_contacts contact
      where contact.account_id = p_account_id
        and (
          v_search = ''
          or contact.email ilike '%' || v_search || '%'
          or contact.full_name ilike '%' || v_search || '%'
        )
        and public.contact_matches_tag_query(
          'email', contact.id, p_tag_conditions, p_tag_match
        )
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'active', (
        select count(*)
        from public.email_contacts contact
        where contact.account_id = p_account_id
          and contact.status = 'active'
          and public.contact_matches_tag_query(
            'email', contact.id, p_tag_conditions, p_tag_match
          )
      ),
      'contacts', coalesce((
        select jsonb_agg(to_jsonb(page) order by page.last_seen_at desc)
        from (
          select
            contact.id, contact.email, contact.full_name, contact.status,
            contact.source, contact.last_seen_at,
            coalesce((
              select array_agg(link.tag_id)
              from public.email_contact_tags link
              where link.email_contact_id = contact.id
            ), '{}') as tag_ids
          from filtered contact
          order by contact.last_seen_at desc
          limit least(greatest(p_limit, 1), 100)
          offset greatest(p_offset, 0)
        ) page
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.search_email_contacts(uuid, text, jsonb, text, integer, integer) from public;
grant execute on function public.search_email_contacts(uuid, text, jsonb, text, integer, integer) to authenticated;

drop function if exists public.search_telegram_contacts(uuid, uuid, text, uuid[], uuid[], boolean, integer, integer);

create function public.search_telegram_contacts(
  p_account_id uuid,
  p_connection_id uuid,
  p_search text default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all',
  p_eligible_only boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := left(regexp_replace(lower(trim(coalesce(p_search, ''))), '[%_]', '', 'g'), 100);
begin
  if not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);
  return (
    with filtered as (
      select contact.*
      from public.telegram_contacts contact
      where contact.account_id = p_account_id
        and contact.integration_connection_id = p_connection_id
        and (
          not p_eligible_only
          or (contact.status = 'active' and contact.broadcast_opted_in_at is not null)
        )
        and (
          v_search = ''
          or contact.username ilike '%' || v_search || '%'
          or contact.first_name ilike '%' || v_search || '%'
          or contact.last_name ilike '%' || v_search || '%'
          or contact.telegram_user_id ilike '%' || v_search || '%'
        )
        and public.contact_matches_tag_query(
          'telegram', contact.id, p_tag_conditions, p_tag_match
        )
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'eligible', (
        select count(*)
        from public.telegram_contacts contact
        where contact.account_id = p_account_id
          and contact.integration_connection_id = p_connection_id
          and contact.status = 'active'
          and contact.broadcast_opted_in_at is not null
          and public.contact_matches_tag_query(
            'telegram', contact.id, p_tag_conditions, p_tag_match
          )
      ),
      'contacts', coalesce((
        select jsonb_agg(to_jsonb(page) order by page.last_seen_at desc)
        from (
          select
            contact.id, contact.integration_connection_id, contact.chat_id,
            contact.telegram_user_id, contact.username, contact.first_name,
            contact.last_name, contact.language_code, contact.status,
            contact.broadcast_opted_in_at, contact.first_seen_at, contact.last_seen_at,
            coalesce((
              select array_agg(link.tag_id)
              from public.telegram_contact_tags link
              where link.telegram_contact_id = contact.id
            ), '{}') as tag_ids
          from filtered contact
          order by contact.last_seen_at desc
          limit least(greatest(p_limit, 1), 100)
          offset greatest(p_offset, 0)
        ) page
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.search_telegram_contacts(uuid, uuid, text, jsonb, text, boolean, integer, integer) from public;
grant execute on function public.search_telegram_contacts(uuid, uuid, text, jsonb, text, boolean, integer, integer) to authenticated;

create or replace function public.list_email_broadcast_contact_ids(
  p_account_id uuid,
  p_search text default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := left(regexp_replace(lower(trim(coalesce(p_search, ''))), '[%_]', '', 'g'), 100);
  v_ids uuid[];
begin
  if not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);
  select coalesce(array_agg(matched.id), '{}') into v_ids
  from (
    select contact.id
    from public.email_contacts contact
    where contact.account_id = p_account_id
      and contact.status = 'active'
      and (
        v_search = ''
        or contact.email ilike '%' || v_search || '%'
        or contact.full_name ilike '%' || v_search || '%'
      )
      and public.contact_matches_tag_query(
        'email', contact.id, p_tag_conditions, p_tag_match
      )
    order by contact.last_seen_at desc
    limit 5001
  ) matched;
  if cardinality(v_ids) > 5000 then
    raise exception 'Select between 1 and 5000 email contacts';
  end if;
  return v_ids;
end;
$$;

revoke all on function public.list_email_broadcast_contact_ids(uuid, text, jsonb, text) from public;
grant execute on function public.list_email_broadcast_contact_ids(uuid, text, jsonb, text) to authenticated;

create or replace function public.list_telegram_broadcast_contact_ids(
  p_account_id uuid,
  p_connection_id uuid,
  p_search text default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := left(regexp_replace(lower(trim(coalesce(p_search, ''))), '[%_]', '', 'g'), 100);
  v_ids uuid[];
begin
  if not (
    public.has_account_role(p_account_id, array['owner', 'admin'])
    or public.is_platform_admin()
  ) then
    raise exception 'Not authorized';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);
  select coalesce(array_agg(matched.id), '{}') into v_ids
  from (
    select contact.id
    from public.telegram_contacts contact
    where contact.account_id = p_account_id
      and contact.integration_connection_id = p_connection_id
      and contact.status = 'active'
      and contact.broadcast_opted_in_at is not null
      and (
        v_search = ''
        or contact.username ilike '%' || v_search || '%'
        or contact.first_name ilike '%' || v_search || '%'
        or contact.last_name ilike '%' || v_search || '%'
        or contact.telegram_user_id ilike '%' || v_search || '%'
      )
      and public.contact_matches_tag_query(
        'telegram', contact.id, p_tag_conditions, p_tag_match
      )
    order by contact.last_seen_at desc
    limit 5001
  ) matched;
  if cardinality(v_ids) > 5000 then
    raise exception 'Select between 1 and 5000 Telegram contacts';
  end if;
  return v_ids;
end;
$$;

revoke all on function public.list_telegram_broadcast_contact_ids(uuid, uuid, text, jsonb, text) from public;
grant execute on function public.list_telegram_broadcast_contact_ids(uuid, uuid, text, jsonb, text) to authenticated;

drop function if exists public.enqueue_email_broadcast(uuid, uuid, uuid, text, text, uuid, uuid[], uuid[], uuid[]);

create function public.enqueue_email_broadcast(
  p_account_id uuid,
  p_connection_id uuid,
  p_sent_by uuid,
  p_subject text,
  p_body text,
  p_request_key uuid,
  p_contact_ids uuid[] default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200 then
    raise exception 'Invalid subject';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 8000 then
    raise exception 'Invalid message';
  end if;
  if not exists (
    select 1 from public.integration_connections connection
    where connection.id = p_connection_id
      and connection.account_id = p_account_id
      and connection.provider in ('brevo', 'resend', 'smtp')
      and connection.status = 'active'
  ) then
    raise exception 'Active email connection not found';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);

  select broadcast.id into v_broadcast_id
  from public.email_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then
    return v_broadcast_id;
  end if;

  update public.email_broadcast_recipients recipient
  set status = 'failed', last_error = 'Siuntimas nutrūko.', updated_at = now()
  from public.email_broadcasts broadcast
  where recipient.broadcast_id = broadcast.id
    and broadcast.account_id = p_account_id
    and broadcast.status in ('queued', 'processing')
    and broadcast.updated_at < now() - interval '30 minutes'
    and recipient.status in ('queued', 'processing');

  update public.email_broadcasts broadcast
  set sent_count = counts.sent_count,
      failed_count = counts.failed_count,
      blocked_count = counts.blocked_count,
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  from (
    select recipient.broadcast_id,
      count(*) filter (where recipient.status = 'sent')::integer as sent_count,
      count(*) filter (where recipient.status = 'failed')::integer as failed_count,
      count(*) filter (where recipient.status = 'blocked')::integer as blocked_count
    from public.email_broadcast_recipients recipient
    group by recipient.broadcast_id
  ) counts
  where broadcast.id = counts.broadcast_id
    and broadcast.account_id = p_account_id
    and broadcast.status in ('queued', 'processing')
    and broadcast.updated_at < now() - interval '30 minutes';

  if exists (
    select 1 from public.email_broadcasts
    where account_id = p_account_id and status in ('queued', 'processing')
  ) then
    raise exception 'An email broadcast is already running';
  end if;

  insert into public.email_broadcasts (
    account_id, integration_connection_id, subject, body, request_key, created_by, recipient_count
  ) values (
    p_account_id, p_connection_id, btrim(p_subject), btrim(p_body), p_request_key, p_sent_by, 1
  ) returning id into v_broadcast_id;

  insert into public.email_broadcast_recipients (broadcast_id, email_contact_id, email)
  select v_broadcast_id, contact.id, contact.email
  from public.email_contacts contact
  where contact.account_id = p_account_id
    and contact.status = 'active'
    and (p_contact_ids is null or contact.id = any (p_contact_ids))
    and (
      p_contact_ids is not null
      or public.contact_matches_tag_query(
        'email', contact.id, p_tag_conditions, p_tag_match
      )
    );

  get diagnostics v_count = row_count;
  if v_count < 1 then
    raise exception 'No active email contacts';
  end if;
  if v_count > 5000 then
    raise exception 'Select between 1 and 5000 email contacts';
  end if;
  update public.email_broadcasts
  set recipient_count = v_count, updated_at = now()
  where id = v_broadcast_id;
  return v_broadcast_id;
end;
$$;

revoke all on function public.enqueue_email_broadcast(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, text) from public;
grant execute on function public.enqueue_email_broadcast(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, text) to service_role;

drop function if exists public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, text, uuid[], timestamptz, uuid[], uuid[]);

create function public.enqueue_telegram_broadcast(
  p_account_id uuid,
  p_connection_id uuid,
  p_sent_by uuid,
  p_message text,
  p_request_key uuid,
  p_image_path text default null,
  p_contact_ids uuid[] default null,
  p_scheduled_for timestamptz default null,
  p_tag_conditions jsonb default null,
  p_tag_match text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_recipient_count integer;
  v_requested_count integer;
  v_status text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 4096 then
    raise exception 'Invalid message';
  end if;
  if p_request_key is null then raise exception 'Request key is required'; end if;
  if p_scheduled_for is not null and p_scheduled_for <= now() + interval '30 seconds' then
    raise exception 'Scheduled time must be in the future';
  end if;
  if p_scheduled_for is not null and p_scheduled_for > now() + interval '1 year' then
    raise exception 'Scheduled time is too far in the future';
  end if;
  if p_image_path is not null and p_image_path !~ ('^' || p_account_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid Telegram broadcast image';
  end if;
  perform public.assert_tag_query(p_account_id, p_tag_conditions, p_tag_match);
  select broadcast.id into v_broadcast_id from public.telegram_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then return v_broadcast_id; end if;
  if not exists (
    select 1 from public.integration_connections connection
    where connection.id = p_connection_id and connection.account_id = p_account_id
      and connection.provider = 'telegram' and connection.status = 'active'
  ) then raise exception 'Active Telegram connection not found'; end if;

  if p_contact_ids is not null then
    select count(distinct contact_id) into v_requested_count from unnest(p_contact_ids) contact_id;
    if v_requested_count < 1 or v_requested_count > 5000 then
      raise exception 'Select between 1 and 5000 Telegram contacts';
    end if;
  end if;

  drop table if exists pg_temp.telegram_broadcast_audience;
  create temporary table telegram_broadcast_audience (
    contact_id uuid primary key,
    chat_id text not null
  ) on commit drop;
  insert into telegram_broadcast_audience(contact_id, chat_id)
  select contact.id, contact.chat_id
  from public.telegram_contacts contact
  where contact.account_id = p_account_id
    and contact.integration_connection_id = p_connection_id
    and contact.status = 'active' and contact.broadcast_opted_in_at is not null
    and (p_contact_ids is null or contact.id = any(p_contact_ids))
    and (
      p_contact_ids is not null
      or public.contact_matches_tag_query(
        'telegram', contact.id, p_tag_conditions, p_tag_match
      )
    )
  order by contact.id
  limit 5001;
  select count(*) into v_recipient_count from telegram_broadcast_audience;
  if v_recipient_count < 1 then raise exception 'No eligible Telegram contacts found'; end if;
  if v_recipient_count > 5000 then raise exception 'Telegram broadcast audience exceeds 5000 contacts'; end if;
  if p_contact_ids is not null and v_recipient_count <> v_requested_count then
    raise exception 'One or more selected contacts are unavailable';
  end if;

  v_status := case when p_scheduled_for is null then 'queued' else 'scheduled' end;
  insert into public.telegram_broadcasts (
    account_id, integration_connection_id, sent_by, message, recipient_count,
    status, request_key, image_path, scheduled_for
  ) values (
    p_account_id, p_connection_id, p_sent_by, btrim(p_message), v_recipient_count,
    v_status, p_request_key, p_image_path, p_scheduled_for
  ) returning public.telegram_broadcasts.id into v_broadcast_id;
  insert into public.telegram_broadcast_recipients (broadcast_id, telegram_contact_id, chat_id)
  select v_broadcast_id, audience.contact_id, audience.chat_id from telegram_broadcast_audience audience;
  return v_broadcast_id;
exception when unique_violation then
  select broadcast.id into v_broadcast_id from public.telegram_broadcasts broadcast
  where broadcast.account_id = p_account_id and broadcast.request_key = p_request_key;
  if v_broadcast_id is not null then return v_broadcast_id; end if;
  raise exception 'Another Telegram broadcast is already active for this bot';
end;
$$;

revoke all on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, text, uuid[], timestamptz, jsonb, text) from public;
grant execute on function public.enqueue_telegram_broadcast(uuid, uuid, uuid, text, uuid, text, uuid[], timestamptz, jsonb, text) to service_role;
