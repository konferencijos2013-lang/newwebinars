-- -----------------------------------------------------------------
-- Fix missing anon access for the public webinar room
-- -----------------------------------------------------------------
-- Real (unauthenticated) attendees hit the room page as `anon`, but:
--   * anon had zero SELECT grant on webinars, chat_messages, or
--     webinar_chat_scripts (only leftover TRIGGER/TRUNCATE/REFERENCES
--     grants existed), so even the initial webinar-by-slug lookup
--     failed with "permission denied for table webinars" before any
--     RLS policy was even evaluated.
--   * There was no RLS policy at all letting a non-account-member
--     (anon or an unrelated authenticated user) SELECT a published
--     webinar row - every existing policy required is_account_member.
--   * chat_messages already had a `using (true)` anon SELECT policy
--     and an anon INSERT policy, but again no base table grant to
--     back them.
--   * registrations had no anon SELECT/UPDATE grant or policy at all,
--     which breaks the token-based waiting-room/join flow for every
--     real attendee (they are never logged in). A blanket anon
--     SELECT/UPDATE policy would leak every attendee's row, though,
--     since RLS can't see the client's own `eq(access_token, ...)`
--     filter - so this is fixed via SECURITY DEFINER RPCs that look
--     up/mutate exactly one row by its unguessable access_token uuid.

grant select on public.webinars to anon;
grant select, insert on public.chat_messages to anon;
grant select on public.webinar_chat_scripts to anon;

drop policy if exists "Webinars: public can view published" on public.webinars;

create policy "Webinars: public can view published"
  on public.webinars
  for select
  to anon, authenticated
  using (
    public.is_webinar_public (id)
  );

drop policy if exists "Webinar chat scripts: public can view active" on public.webinar_chat_scripts;

create policy "Webinar chat scripts: public can view active"
  on public.webinar_chat_scripts
  for select
  to anon, authenticated
  using (
    is_active
    and public.is_webinar_public (webinar_id)
  );

-- ---------------------------------------------------------------------
-- Token-scoped registration access (avoids granting anon blanket
-- SELECT/UPDATE on the registrations table, which would let anyone
-- dump or mutate every attendee's row regardless of the token they
-- actually hold).
-- ---------------------------------------------------------------------

create or replace function public.get_registration_by_token (p_access_token uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  select * into result
  from public.registrations
  where access_token = p_access_token;

  return result;
end;
$$;

comment on function public.get_registration_by_token (uuid) is 'Looks up a single registration by its unguessable access_token; safe for anon since only the exact matching row is ever returned.';

create or replace function public.mark_registration_entered_waiting_room (p_access_token uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  update public.registrations
  set entered_waiting_room_at = now(),
      entered_at = now()
  where access_token = p_access_token
  returning * into result;

  return result;
end;
$$;

comment on function public.mark_registration_entered_waiting_room (uuid) is 'Marks the registration matching this access_token as having entered the waiting room.';

create or replace function public.mark_registration_joined_webinar (p_access_token uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.registrations;
begin
  update public.registrations
  set joined_webinar_at = now(),
      joined_at = now()
  where access_token = p_access_token
  returning * into result;

  return result;
end;
$$;

comment on function public.mark_registration_joined_webinar (uuid) is 'Marks the registration matching this access_token as having joined the live webinar room.';

alter function public.get_registration_by_token (uuid) owner to postgres;
alter function public.mark_registration_entered_waiting_room (uuid) owner to postgres;
alter function public.mark_registration_joined_webinar (uuid) owner to postgres;

grant execute on function public.get_registration_by_token (uuid) to anon, authenticated;
grant execute on function public.mark_registration_entered_waiting_room (uuid) to anon, authenticated;
grant execute on function public.mark_registration_joined_webinar (uuid) to anon, authenticated;
