-- Webinar CTA state and evergreen timeline timing

alter table public.webinars
  add column if not exists chat_script_offset_seconds integer not null default 0;

delete from public.webinar_offers older
using public.webinar_offers newer
where older.webinar_id = newer.webinar_id
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);

alter table public.webinar_offers
  add constraint webinar_offers_one_per_webinar unique (webinar_id);

create type public.webinar_cta_action as enum ('show', 'hide');

create table public.webinar_cta_script_events (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  trigger_seconds integer not null check (trigger_seconds >= 0),
  action public.webinar_cta_action not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_webinar_cta_script_events_timeline
  on public.webinar_cta_script_events(webinar_id, trigger_seconds, sort_order);

create table public.webinar_cta_live_state (
  webinar_id uuid primary key references public.webinars(id) on delete cascade,
  is_visible boolean not null default false,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);

alter table public.webinar_cta_script_events enable row level security;
alter table public.webinar_cta_live_state enable row level security;
grant select, insert, update, delete on public.webinar_cta_script_events to authenticated;
grant select on public.webinar_cta_script_events to anon;
grant select on public.webinar_cta_live_state to anon, authenticated;

create policy "CTA events: moderators manage" on public.webinar_cta_script_events
  for all to authenticated
  using (public.can_moderate_webinar(webinar_id))
  with check (public.can_moderate_webinar(webinar_id));
create policy "CTA events: public view active" on public.webinar_cta_script_events
  for select to anon, authenticated
  using (is_active and public.is_webinar_public(webinar_id));
create policy "CTA live state: public view" on public.webinar_cta_live_state
  for select to anon, authenticated
  using (public.is_webinar_public(webinar_id));

create or replace function public.set_webinar_cta_live_visibility(
  p_webinar_id uuid, p_is_visible boolean
) returns public.webinar_cta_live_state
language plpgsql security definer set search_path = public
as $$
declare result public.webinar_cta_live_state;
begin
  if not public.can_moderate_webinar(p_webinar_id) then
    raise exception 'Not allowed to control webinar CTA' using errcode = '42501';
  end if;
  if p_is_visible and not exists (
    select 1 from public.webinar_offers
    where webinar_id = p_webinar_id and active and target_url is not null
  ) then
    raise exception 'Configure an active offer with a target URL first';
  end if;
  insert into public.webinar_cta_live_state(webinar_id, is_visible, changed_at, changed_by)
  values (p_webinar_id, p_is_visible, now(), auth.uid())
  on conflict (webinar_id) do update
  set is_visible = excluded.is_visible, changed_at = excluded.changed_at, changed_by = excluded.changed_by
  returning * into result;
  return result;
end;
$$;
alter function public.set_webinar_cta_live_visibility(uuid, boolean) owner to postgres;
grant execute on function public.set_webinar_cta_live_visibility(uuid, boolean) to authenticated;

alter table public.webinar_cta_live_state replica identity full;
alter table public.webinar_cta_script_events replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.webinar_cta_live_state;
exception when duplicate_object then null; end $$;
