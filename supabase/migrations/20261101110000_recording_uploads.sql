-- Private webinar recordings: account-scoped files, playback via signed URLs,
-- and storage quota taken from the account's current plan.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  2147483648,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Recordings bucket: account members manage own folder" on storage.objects;
create policy "Recordings bucket: account members manage own folder"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] in (
      select account_id::text
      from public.account_members
      where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] in (
      select account_id::text
      from public.account_members
      where user_id = auth.uid()
    )
  );

create or replace function public.account_recording_quota_bytes(p_account_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits jsonb;
begin
  select p.limits
    into v_limits
  from public.credit_plans p
  where p.id = coalesce(
    (
      select assignment.credit_plan_id
      from public.internal_account_plan_assignments assignment
      where assignment.account_id = p_account_id
      limit 1
    ),
    (
      select subscription.credit_plan_id
      from public.subscriptions subscription
      where subscription.account_id = p_account_id
        and subscription.is_current
        and subscription.access_granted_at is not null
        and subscription.status in ('active', 'trialing', 'past_due', 'paused')
      order by subscription.created_at desc
      limit 1
    ),
    (
      select default_plan.id
      from public.credit_plans default_plan
      where default_plan.is_active
        and default_plan.is_default
      limit 1
    )
  )
  limit 1;

  if not found or v_limits is null then
    return 1073741824;
  end if;

  if v_limits ? 'max_storage_bytes' then
    return greatest(coalesce((v_limits ->> 'max_storage_bytes')::bigint, 0), 0);
  end if;

  -- Plans without a storage cap, including the internal unlimited plan.
  return 10995116277760;
end;
$$;

revoke all on function public.account_recording_quota_bytes(uuid) from public, anon, authenticated;
grant execute on function public.account_recording_quota_bytes(uuid) to service_role;

create or replace function public.refresh_account_storage_usage(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_count integer;
  v_quota bigint;
begin
  select
    coalesce(sum(size_bytes), 0),
    coalesce(count(*), 0)
  into v_total, v_count
  from public.recordings
  where account_id = p_account_id
    and status <> 'deleted';

  v_quota := public.account_recording_quota_bytes(p_account_id);

  insert into public.account_storage_usage (
    account_id, total_bytes, quota_bytes, recordings_count, updated_at
  )
  values (p_account_id, v_total, v_quota, v_count, now())
  on conflict (account_id) do update
  set total_bytes = excluded.total_bytes,
      quota_bytes = excluded.quota_bytes,
      recordings_count = excluded.recordings_count,
      updated_at = now();
end;
$$;

create or replace function public.enforce_recording_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
  v_quota bigint;
begin
  if new.status = 'deleted' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.size_bytes is not distinct from old.size_bytes
     and new.status is not distinct from old.status
     and new.account_id is not distinct from old.account_id then
    return new;
  end if;

  select coalesce(sum(size_bytes), 0)
    into v_used
  from public.recordings
  where account_id = new.account_id
    and status <> 'deleted'
    and id is distinct from new.id;

  v_quota := public.account_recording_quota_bytes(new.account_id);

  if v_used + coalesce(new.size_bytes, 0) > v_quota then
    raise exception 'storage_quota_exceeded'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists recordings_enforce_storage_quota on public.recordings;
create trigger recordings_enforce_storage_quota
  before insert or update on public.recordings
  for each row
  execute function public.enforce_recording_storage_quota();

create or replace function public.recordings_refresh_storage_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_account_storage_usage(coalesce(new.account_id, old.account_id));
  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    perform public.refresh_account_storage_usage(old.account_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists recordings_refresh_storage_usage on public.recordings;
create trigger recordings_refresh_storage_usage
  after insert or update or delete on public.recordings
  for each row
  execute function public.recordings_refresh_storage_usage();

do $$
declare
  account_row record;
begin
  for account_row in select id from public.accounts loop
    perform public.refresh_account_storage_usage(account_row.id);
  end loop;
end;
$$;
