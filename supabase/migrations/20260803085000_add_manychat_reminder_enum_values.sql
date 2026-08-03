-- Keep enum additions in a separate migration: PostgreSQL cannot safely use a
-- newly added enum value in the same transaction.
alter type public.reminder_status add value if not exists 'skipped';
alter type public.reminder_log_status add value if not exists 'skipped';

alter table public.reminder_rules drop constraint if exists reminder_rules_channel_check;
alter table public.reminder_rules add constraint reminder_rules_channel_check
  check (channel in ('email', 'telegram', 'manychat'));
