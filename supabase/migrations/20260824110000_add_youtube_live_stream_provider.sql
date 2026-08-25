-- -----------------------------------------------------------------
-- Alternative live delivery provider: manual YouTube Live configuration
-- -----------------------------------------------------------------
-- The URL is public playback metadata, not a YouTube stream key or an OAuth
-- credential. Hosts retain the existing Cloudflare Stream default.

alter table public.webinars
  add column stream_provider text not null default 'cloudflare'
    check (stream_provider in ('cloudflare', 'youtube')),
  add column youtube_live_url text;

alter table public.webinars
  add constraint webinars_youtube_live_url_check
  check (
    youtube_live_url is null
    or youtube_live_url ~* '^https?://((www|m)\.)?(youtube\.com|youtu\.be)/'
  );

comment on column public.webinars.stream_provider is 'Live playback provider: cloudflare or manually configured YouTube Live.';
comment on column public.webinars.youtube_live_url is 'Public YouTube Live watch, live, embed, or youtu.be URL. Never stores stream keys or OAuth tokens.';

create index idx_webinars_stream_provider on public.webinars (stream_provider);
