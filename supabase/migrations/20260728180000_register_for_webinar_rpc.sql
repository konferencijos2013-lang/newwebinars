-- -----------------------------------------------------------------
-- Fix public webinar registration failing with 42501 for anon
-- -----------------------------------------------------------------
-- registerForWebinar() on the frontend does
-- `.from('registrations').insert(...).select().single()`. Postgres requires
-- SELECT privilege on the table to return the RETURNING row, but anon only
-- ever had INSERT granted on registrations (see role_table_grants), so every
-- real (unauthenticated) attendee registration failed outright with
-- "permission denied for table registrations" (42501) before the RLS
-- policies were even evaluated. Since the insert silently failed, attendees
-- never received an access_token, so the waiting room and live room could
-- never authenticate them either — this was the root cause of the room
-- "not found" errors for real visitors.
--
-- Rather than granting anon a blanket SELECT on registrations (which would
-- let anyone dump every attendee's email/name/phone by querying the table
-- directly), move the whole registration flow into a SECURITY DEFINER RPC.
-- The function performs the same checks as the existing INSERT policy
-- (open-for-registration + partner code validity) and returns only the row
-- it just created.

create or replace function public.register_for_webinar (
  p_webinar_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null,
  p_company text default null,
  p_referrer_url text default null,
  p_referral_code text default null
)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  if not public.is_webinar_open_for_registration (p_webinar_id) then
    raise exception 'Webinar is not open for registration';
  end if;

  if p_referral_code is not null and not public.is_active_partner_code (p_referral_code) then
    raise exception 'Invalid referral code';
  end if;

  insert into public.registrations (
    webinar_id,
    email,
    full_name,
    phone,
    company,
    referrer_url,
    referral_code,
    status
  )
  values (
    p_webinar_id,
    p_email,
    p_full_name,
    p_phone,
    p_company,
    p_referrer_url,
    p_referral_code,
    'registered'
  )
  returning * into result;

  return result;
end;
$$;

comment on function public.register_for_webinar (uuid, text, text, text, text, text, text) is 'Registers an attendee for a webinar; safe for anon since it only ever returns the single row it just created and re-checks the same open-for-registration/partner-code rules the old anon INSERT policy enforced.';

alter function public.register_for_webinar (uuid, text, text, text, text, text, text) owner to postgres;

grant execute on function public.register_for_webinar (uuid, text, text, text, text, text, text) to anon, authenticated;
