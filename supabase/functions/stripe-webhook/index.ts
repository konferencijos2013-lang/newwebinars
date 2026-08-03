import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return reply({ error: 'Missing signature' }, 400)
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  })
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    )
  } catch {
    return reply({ error: 'Invalid webhook signature' }, 400)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { error: ledgerError } = await db
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: { api_version: event.api_version },
    })
  if (ledgerError?.code === '23505')
    return reply({ received: true, duplicate: true })
  if (ledgerError) return reply({ error: 'Unable to record webhook' }, 500)

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const accountId = session.metadata?.account_id
      const planId = session.metadata?.plan_id
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
      if (!accountId || !planId || !stripeSubscriptionId)
        throw new Error('Checkout metadata is incomplete')
      const subscription =
        await stripe.subscriptions.retrieve(stripeSubscriptionId)
      const { error } = await db.from('subscriptions').upsert(
        {
          account_id: accountId,
          credit_plan_id: planId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription.items.data[0]?.price.id ?? null,
          status: subscription.status,
          current_period_start: new Date(
            subscription.current_period_start * 1000,
          ).toISOString(),
          current_period_end: new Date(
            subscription.current_period_end * 1000,
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        },
        { onConflict: 'stripe_subscription_id' },
      )
      if (error) throw error
      await db.from('accounts').update({ plan: 'paid' }).eq('id', accountId)
      const { error: creditsError } = await db.rpc(
        'reset_account_credits_for_plan',
        {
          p_account_id: accountId,
          p_plan_id: planId,
          p_period_started_at: new Date(
            subscription.current_period_start * 1000,
          ).toISOString(),
          p_period_ends_at: new Date(
            subscription.current_period_end * 1000,
          ).toISOString(),
        },
      )
      if (creditsError) throw creditsError
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      const stripeSubscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id
      if (stripeSubscriptionId) {
        const { data: subscription, error } = await db
          .from('subscriptions')
          .select('id,account_id,credit_plan_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .single()
        if (error) throw error
        const { error: paymentError } = await db
          .from('payments')
          .upsert(
            {
              account_id: subscription.account_id,
              subscription_id: subscription.id,
              stripe_payment_intent_id:
                typeof invoice.payment_intent === 'string'
                  ? invoice.payment_intent
                  : (invoice.payment_intent?.id ?? null),
              stripe_invoice_id: invoice.id,
              amount_cents: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              paid_at: new Date(
                (invoice.status_transitions.paid_at ??
                  Math.floor(Date.now() / 1000)) * 1000,
              ).toISOString(),
            },
            { onConflict: 'stripe_invoice_id' },
          )
        if (paymentError) throw paymentError
        const periodStart = new Date(invoice.period_start * 1000).toISOString(),
          periodEnd = new Date(invoice.period_end * 1000).toISOString()
        await db
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: periodStart,
            current_period_end: periodEnd,
          })
          .eq('id', subscription.id)
        if (subscription.credit_plan_id) {
          const { error: creditsError } = await db.rpc(
            'reset_account_credits_for_plan',
            {
              p_account_id: subscription.account_id,
              p_plan_id: subscription.credit_plan_id,
              p_period_started_at: periodStart,
              p_period_ends_at: periodEnd,
            },
          )
          if (creditsError) throw creditsError
        }
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const stripeSubscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id
      if (stripeSubscriptionId)
        await db
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', stripeSubscriptionId)
    }
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription
      await db
        .from('subscriptions')
        .update({
          status: subscription.status,
          current_period_start: new Date(
            subscription.current_period_start * 1000,
          ).toISOString(),
          current_period_end: new Date(
            subscription.current_period_end * 1000,
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        })
        .eq('stripe_subscription_id', subscription.id)
    }
    return reply({ received: true })
  } catch (err) {
    // Do not mark a failed event as processed: Stripe can safely retry it.
    // Payment writes are additionally idempotent by Stripe invoice ID.
    await db
      .from('stripe_webhook_events')
      .delete()
      .eq('stripe_event_id', event.id)
    console.error('Stripe webhook processing failed', event.id, err)
    return reply({ error: 'Webhook processing failed' }, 500)
  }
})
