-- Make attendee-specific and public webinar links available to reminder templates.
drop function if exists public.claim_due_reminders(integer);

create function public.claim_due_reminders(p_limit integer default 50)
returns table (
  queue_id uuid,
  registration_id uuid,
  rule_id uuid,
  retry_count integer,
  email text,
  full_name text,
  webinar_title text,
  webinar_slug text,
  access_token uuid,
  public_hostname text,
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
    r.email, r.full_name, w.title, w.slug, r.access_token,
    coalesce(
      case when a.custom_domain_status = 'verified' then a.custom_domain end,
      a.public_subdomain || '.newwebinars.com',
      'newwebinars.com'
    ),
    rr.subject, rr.body, ic.id, ic.provider, ic.config
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.webinars w on w.id = r.webinar_id
  join public.accounts a on a.id = w.account_id
  join public.reminder_rules rr on rr.id = c.rule_id
  join public.integration_connections ic on ic.id = rr.integration_connection_id;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public;
grant execute on function public.claim_due_reminders(integer) to service_role;
