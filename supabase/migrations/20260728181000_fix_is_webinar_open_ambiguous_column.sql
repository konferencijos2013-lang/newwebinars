-- -----------------------------------------------------------------
-- Fix ambiguous column reference in is_webinar_open_for_registration
-- -----------------------------------------------------------------
-- The function's parameter was named `webinar_id`, identical to the
-- `registrations.webinar_id` column it queries. PL/pgSQL raises
-- "column reference \"webinar_id\" is ambiguous" (42702) for the unqualified
-- reference in `where r.webinar_id = webinar_id`. This never surfaced
-- before because anon inserts into registrations failed earlier with a
-- plain permission-denied error (42501, fixed in the previous migration),
-- so RLS — and this function — was never actually reached for anon. Now
-- that anon registration goes through a SECURITY DEFINER RPC that legitimately
-- reaches this check, the bug needs fixing so registration doesn't fail with
-- 42702 for every open webinar.
create or replace function public.is_webinar_open_for_registration(webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_max int;
  v_count int;
  v_lock_key bigint;
  v_webinar_id alias for webinar_id;
begin
  -- Serialize capacity checks per webinar to prevent overselling under concurrency.
  v_lock_key := hashtextextended (v_webinar_id::text, 0);
  perform pg_advisory_xact_lock (v_lock_key);

  select w.status, w.max_participants into v_status, v_max
  from public.webinars w
  where w.id = v_webinar_id;

  if v_status not in ('published', 'live') then
    return false;
  end if;

  select count (*) into v_count
  from public.registrations r
  where r.webinar_id = v_webinar_id and r.cancelled_at is null;

  return v_max is null or v_count < v_max;
end;
$function$;
