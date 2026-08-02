-- Keep unsent reminder jobs aligned when a rule is added, changed, disabled, or removed.
create or replace function public.sync_reminder_rule_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.reminder_queue
    where rule_id = old.id and status = 'queued'::public.reminder_status;
    return old;
  end if;

  if not new.is_enabled or new.channel <> 'email' then
    delete from public.reminder_queue
    where rule_id = new.id and status = 'queued'::public.reminder_status;
    return new;
  end if;

  update public.reminder_queue q
  set scheduled_at = w.scheduled_at - make_interval(mins => new.minutes_before),
      updated_at = now()
  from public.registrations r
  join public.webinars w on w.id = r.webinar_id
  where q.rule_id = new.id
    and q.registration_id = r.id
    and q.status = 'queued'::public.reminder_status
    and w.scheduled_at is not null;

  insert into public.reminder_queue (registration_id, rule_id, scheduled_at)
  select r.id, new.id, w.scheduled_at - make_interval(mins => new.minutes_before)
  from public.registrations r
  join public.webinars w on w.id = r.webinar_id
  where r.webinar_id = new.webinar_id
    and r.cancelled_at is null
    and w.scheduled_at is not null
    and w.scheduled_at - make_interval(mins => new.minutes_before) >= now()
  on conflict (registration_id, rule_id) where rule_id is not null do nothing;

  return new;
end;
$$;

alter function public.sync_reminder_rule_queue() owner to postgres;

drop trigger if exists reminder_rules_queue_sync on public.reminder_rules;
create trigger reminder_rules_queue_sync
after insert or update of minutes_before, is_enabled, channel, webinar_id or delete
on public.reminder_rules
for each row execute function public.sync_reminder_rule_queue();
