-- -----------------------------------------------------------------
-- Cloudflare Stream live streaming support
-- -----------------------------------------------------------------

alter table public.webinars
  add column cf_live_input_uid text,
  add column cf_stream_status text not null default 'idle'
    check (cf_stream_status in ('idle', 'connected', 'live', 'ended', 'errored')),
  add column cf_playback_hls_url text,
  add column cf_playback_dash_url text,
  add column cf_recording_video_uid text;

comment on column public.webinars.cf_live_input_uid is 'Cloudflare Stream Live Input UID.';
comment on column public.webinars.cf_stream_status is 'Current Cloudflare live input status mirrored via webhook.';
comment on column public.webinars.cf_playback_hls_url is 'HLS playback URL for viewers.';
comment on column public.webinars.cf_playback_dash_url is 'DASH playback URL for viewers.';
comment on column public.webinars.cf_recording_video_uid is 'Cloudflare VOD video UID created after live session ends.';

create index idx_webinars_cf_status on public.webinars (cf_stream_status);
create index idx_webinars_cf_input_uid on public.webinars (cf_live_input_uid);

-- -----------------------------------------------------------------
-- Live session records for billing and analytics
-- -----------------------------------------------------------------

create table public.webinar_live_sessions (
  id uuid primary key default gen_random_uuid (),
  webinar_id uuid not null references public.webinars (id) on delete cascade,
  cf_live_input_uid text not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int default 0 check (duration_seconds >= 0),
  peak_viewers int default 0 check (peak_viewers >= 0),
  recording_video_uid text,
  status text not null default 'pending'
    check (status in ('pending', 'live', 'ended', 'errored')),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

comment on table public.webinar_live_sessions is 'Individual live streaming sessions used for metering and analytics.';

create index idx_webinar_live_sessions_webinar_id on public.webinar_live_sessions (webinar_id);
create index idx_webinar_live_sessions_status on public.webinar_live_sessions (status);

-- -----------------------------------------------------------------
-- Helper to emit live session usage event when session ends
-- -----------------------------------------------------------------

create or replace function public.emit_live_session_usage(p_session_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_session public.webinar_live_sessions;
  v_webinar public.webinars;
  v_minutes int;
begin
  select * into v_session from public.webinar_live_sessions where id = p_session_id;
  if not found or v_session.duration_seconds = 0 then
    return;
  end if;

  select * into v_webinar from public.webinars where id = v_session.webinar_id;
  if not found then
    return;
  end if;

  v_minutes := ceil(v_session.duration_seconds / 60.0);

  insert into public.usage_events (account_id, credit_type, scope, scope_id, quantity, metadata)
  values (
    v_webinar.account_id,
    'live_webinar_minute',
    'webinar',
    v_webinar.id,
    v_minutes,
    jsonb_build_object(
      'session_id', v_session.id,
      'live_input_uid', v_session.cf_live_input_uid,
      'recording_video_uid', v_session.recording_video_uid
    )
  );
end;
$$;

-- -----------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------

alter table public.webinar_live_sessions enable row level security;

grant select, insert, update on public.webinar_live_sessions to authenticated;

drop policy if exists "Live sessions: account members can view" on public.webinar_live_sessions;
create policy "Live sessions: account members can view"
  on public.webinar_live_sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.webinars w
      where w.id = webinar_live_sessions.webinar_id
      and public.is_account_member(w.account_id)
    )
    or public.is_platform_admin ()
  );

drop policy if exists "Live sessions: editors can manage" on public.webinar_live_sessions;
create policy "Live sessions: editors can manage"
  on public.webinar_live_sessions
  for all
  to authenticated
  using (
    exists (
      select 1 from public.webinars w
      where w.id = webinar_live_sessions.webinar_id
      and public.has_account_role(w.account_id, array['owner', 'admin', 'editor', 'host'])
    )
    or public.is_platform_admin ()
  )
  with check (
    exists (
      select 1 from public.webinars w
      where w.id = webinar_live_sessions.webinar_id
      and public.has_account_role(w.account_id, array['owner', 'admin', 'editor', 'host'])
    )
    or public.is_platform_admin ()
  );
