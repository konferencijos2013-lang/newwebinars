-- Make reminder delivery resilient to duplicate queueing and worker failures.

-- A registration can receive each configured reminder exactly once.
create unique index if not exists reminder_queue_registration_rule_unique
  on public.reminder_queue (registration_id, rule_id)
  where rule_id is not null;

-- Reclaim deliveries when a worker was interrupted after claiming them. This makes
-- the queue self-healing instead of leaving messages in `processing` indefinitely.
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (
  queue_id uuid,
  registration_id uuid,
  rule_id uuid,
  retry_count integer,
  email text,
  full_name text,
  webinar_title text,
  subject text,
  body text,
  connection_id uuid,
  provider public.integration_provider,
  provider_config jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reminder_queue
  set status = 'queued'::public.reminder_status,
      scheduled_at = now(),
      error_message = coalesce(error_message, 'Delivery worker timed out; retrying.'),
      updated_at = now()
  where status = 'processing'::public.reminder_status
    and updated_at < now() - interval '10 minutes';

  return query
  with due as (
    select q.id
    from public.reminder_queue q
    join public.reminder_rules rr on rr.id = q.rule_id
    join public.integration_connections ic on ic.id = rr.integration_connection_id
      and ic.status = 'active'
    where q.status = 'queued'::public.reminder_status
      and q.scheduled_at <= now()
      and q.retry_count < 5
    order by q.scheduled_at, q.created_at
    for update of q skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.reminder_queue q
    set status = 'processing'::public.reminder_status, updated_at = now()
    from due
    where q.id = due.id
    returning q.id, q.registration_id, q.rule_id, q.retry_count
  )
  select c.id, c.registration_id, c.rule_id, c.retry_count,
    r.email, r.full_name, w.title, rr.subject, rr.body,
    ic.id, ic.provider, ic.config
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.webinars w on w.id = r.webinar_id
  join public.reminder_rules rr on rr.id = c.rule_id
  join public.integration_connections ic on ic.id = rr.integration_connection_id;
end;
$$;

-- Failed provider calls are retried with bounded exponential backoff: 1, 2, 4,
-- 8 minutes, then marked permanently failed after the fifth failed attempt.
create or replace function public.complete_reminder_delivery(
  p_queue_id uuid,
  p_status public.reminder_log_status,
  p_provider_response text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.reminder_queue;
begin
  update public.reminder_queue
  set retry_count = case when p_status = 'failed' then retry_count + 1 else retry_count end,
      status = case
        when p_status = 'sent' then 'sent'::public.reminder_status
        when retry_count + 1 >= 5 then 'failed'::public.reminder_status
        else 'queued'::public.reminder_status
      end,
      scheduled_at = case
        when p_status = 'failed' and retry_count + 1 < 5
          then now() + make_interval(mins => power(2, retry_count)::integer)
        else scheduled_at
      end,
      sent_at = case when p_status = 'sent' then now() else null end,
      failed_at = case when p_status = 'failed' and retry_count + 1 >= 5 then now() else null end,
      error_message = p_error_message,
      updated_at = now()
  where id = p_queue_id and status = 'processing'::public.reminder_status
  returning * into v_queue;

  if v_queue.id is not null then
    insert into public.reminder_logs(queue_id, registration_id, rule_id, status, provider_response)
    values (v_queue.id, v_queue.registration_id, v_queue.rule_id, p_status, p_provider_response);
  end if;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public;
revoke all on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) from public;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, public.reminder_log_status, text, text) to service_role;
