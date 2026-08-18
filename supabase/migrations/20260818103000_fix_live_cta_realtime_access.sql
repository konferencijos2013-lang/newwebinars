-- Let the webinar owner, admin, and host read CTA changes in an open
-- host-preview room even before the webinar becomes publicly visible.
-- This also permits Supabase Realtime to deliver the state update to them.

drop policy if exists "CTA live state: public view" on public.webinar_cta_live_state;

create policy "CTA live state: public and moderators view"
  on public.webinar_cta_live_state
  for select
  to anon, authenticated
  using (
    public.is_webinar_public(webinar_id)
    or (
      auth.uid() is not null
      and public.can_moderate_webinar(webinar_id)
    )
  );
