-- Make invoice upserts compatible with PostgreSQL conflict inference and use the
-- Stripe subscription billing period when granting recurring credits.

drop index if exists public.payments_stripe_invoice_id_unique;
create unique index payments_stripe_invoice_id_unique
  on public.payments (stripe_invoice_id);

create or replace function public.process_paid_stripe_invoice(
  p_account_id uuid, p_plan_id uuid, p_subscription_id text, p_invoice_id text,
  p_payment_intent_id text, p_amount_cents integer, p_currency text,
  p_invoice_status text, p_paid_at timestamptz, p_period_start timestamptz,
  p_period_end timestamptz, p_event_created_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_subscription public.subscriptions%rowtype; v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  select * into v_subscription from public.subscriptions
    where stripe_subscription_id = p_subscription_id for update;
  if v_subscription.id is null then raise exception 'Subscription % not found', p_subscription_id; end if;

  select * into v_payment from public.payments where stripe_invoice_id = p_invoice_id for update;
  if found and v_payment.credits_granted_at is not null then return false; end if;
  if found and v_payment.status = 'refunded'
    and v_payment.stripe_event_created_at > p_event_created_at then return false; end if;

  insert into public.payments(
    account_id, subscription_id, stripe_payment_intent_id, stripe_invoice_id,
    amount_cents, currency, status, invoice_status, paid_at,
    stripe_event_created_at, failure_message
  ) values (
    p_account_id, v_subscription.id, p_payment_intent_id, p_invoice_id,
    p_amount_cents, p_currency, 'succeeded', p_invoice_status, p_paid_at,
    p_event_created_at, null
  ) on conflict (stripe_invoice_id) do update set
    account_id = excluded.account_id, subscription_id = excluded.subscription_id,
    stripe_payment_intent_id = excluded.stripe_payment_intent_id,
    amount_cents = excluded.amount_cents, currency = excluded.currency,
    status = 'succeeded', invoice_status = excluded.invoice_status,
    paid_at = excluded.paid_at, stripe_event_created_at = excluded.stripe_event_created_at,
    failure_message = null, updated_at = now();

  if v_subscription.is_current and v_subscription.status not in ('canceled', 'incomplete_expired', 'unpaid') then
    update public.subscriptions set access_granted_at = coalesce(access_granted_at, p_paid_at),
      updated_at = now() where id = v_subscription.id;
    update public.accounts set plan = 'paid', updated_at = now() where id = p_account_id;
    perform public.reset_account_credits_for_plan(
      p_account_id, p_plan_id,
      coalesce(v_subscription.current_period_start, p_period_start),
      coalesce(v_subscription.current_period_end, p_period_end)
    );
    if p_amount_cents > 0 then
      perform public.create_affiliate_commission_for_payment(p_invoice_id);
    end if;
    update public.payments set credits_granted_at = now(), updated_at = now()
      where stripe_invoice_id = p_invoice_id;
    return true;
  end if;
  return false;
end $$;

revoke all on function public.process_paid_stripe_invoice(uuid,uuid,text,text,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.process_paid_stripe_invoice(uuid,uuid,text,text,text,integer,text,text,timestamptz,timestamptz,timestamptz,timestamptz) to service_role;
