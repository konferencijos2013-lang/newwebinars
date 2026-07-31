-- Extend account delivery connections with common email providers.
alter type public.integration_provider add value if not exists 'brevo';
alter type public.integration_provider add value if not exists 'smtp';

-- Ensure a reminder cannot use an integration belonging to another account.
create or replace function public.validate_reminder_rule_connection()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_webinar_account_id uuid;
  v_connection_account_id uuid;
begin
  if new.integration_connection_id is null then
    return new;
  end if;

  select account_id into v_webinar_account_id from public.webinars where id = new.webinar_id;
  select account_id into v_connection_account_id from public.integration_connections where id = new.integration_connection_id;

  if v_webinar_account_id is null or v_connection_account_id is null or v_webinar_account_id <> v_connection_account_id then
    raise exception 'Reminder integration must belong to the webinar account';
  end if;
  return new;
end;
$$;

drop trigger if exists reminder_rule_connection_account_check on public.reminder_rules;
create trigger reminder_rule_connection_account_check
before insert or update of webinar_id, integration_connection_id on public.reminder_rules
for each row execute function public.validate_reminder_rule_connection();
