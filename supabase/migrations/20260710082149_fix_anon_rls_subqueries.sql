-- Fix anon RLS policies so they can check webinar state without being granted
-- direct SELECT access to the base webinars table.

-- Security-definer helper: returns true when a webinar is visible to the public.
create or replace function public.is_webinar_public (webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.webinars
    where id = webinar_id and status in ('published', 'live', 'ended')
  );
end;
$$;

comment on function public.is_webinar_public (uuid) is 'True if a webinar is in a publicly visible status; used by RLS policies for anon access.';

-- Security-definer helper: returns true when a webinar accepts registrations.
create or replace function public.is_webinar_open_for_registration (webinar_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.webinars
    where id = webinar_id and status in ('published', 'live')
  );
end;
$$;

comment on function public.is_webinar_open_for_registration (uuid) is 'True if a webinar accepts new registrations; used by RLS policies for anon inserts.';

-- Ensure the functions are owned by postgres so they bypass RLS.
alter function public.is_webinar_public (uuid) owner to postgres;
alter function public.is_webinar_open_for_registration (uuid) owner to postgres;

-- Re-create anon policies using the helpers instead of direct table access.

drop policy if exists "Webinar offers: public view active" on public.webinar_offers;

create policy "Webinar offers: public view active"
  on public.webinar_offers
  for select
  to anon, authenticated
  using (
    active
    and public.is_webinar_public (webinar_id)
  );

drop policy if exists "Registrations: public can register for published/live webinars" on public.registrations;

create policy "Registrations: public can register for published/live webinars"
  on public.registrations
  for insert
  to anon, authenticated
  with check (
    public.is_webinar_open_for_registration (webinar_id)
  );
