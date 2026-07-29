-- -----------------------------------------------------------------
-- Chat moderation: allow admins to delete messages
-- -----------------------------------------------------------------

-- Add deleted_at soft-delete column so we keep an audit trail.
alter table public.chat_messages
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references public.profiles (id) on delete set null;

comment on column public.chat_messages.deleted_at is 'Soft-delete timestamp; when set, the message is hidden from viewers.';
comment on column public.chat_messages.deleted_by is 'Profile id of the moderator who deleted the message.';

-- Only account members with admin/owner/editor/host role can delete.
drop policy if exists "Chat messages: account members can delete" on public.chat_messages;
create policy "Chat messages: account members can delete"
  on public.chat_messages
  for delete
  to authenticated
  using (
    public.is_account_member (webinar_id, auth.uid())
  );

-- Hide deleted messages from the public view.
drop policy if exists "Chat messages: webinar participants can view" on public.chat_messages;
create policy "Chat messages: webinar participants can view"
  on public.chat_messages
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and public.is_webinar_public (webinar_id)
  );
