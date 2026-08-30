import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'
import { requireEnv, stripeId, unixToIso } from '../_shared/billing.ts'

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const accountMetadata = (object: { metadata?: Stripe.Metadata | null }) =>
  object.metadata?.account_id ?? null

serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  let eventId: string | null = null
  let processingToken: string | null = null
  try {
    const stripe = new Stripe(requireEnv(Deno.env.get, 'STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const signature = req.headers.get('stripe-signature')
    if (!signature) return reply({ error: 'Missing signature' }, 400)
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(
        await req.text(),
        signature,
        requireEnv(Deno.env.get, 'STRIPE_WEBHOOK_SECRET'),
      )
    } catch {
      return reply({ error: 'Invalid webhook signature' }, 400)
    }
    eventId = event.id
    processingToken = crypto.randomUUID()
    const db = createClient(
      requireEnv(Deno.env.get, 'SUPABASE_URL'),
      requireEnv(Deno.env.get, 'SUPABASE_SERVICE_ROLE_KEY'),
    )
    const eventTime = unixToIso(event.created)!
    const { data: claimed, error: claimError } = await db.rpc(
      'claim_stripe_webhook_event',
      {
        p_event_id: event.id,
        p_event_type: event.type,
        p_event_created_at: eventTime,
        p_processing_token: processingToken,
        p_payload: { api_version: event.api_version, livemode: event.livemode },
      },
    )
    if (claimError) throw claimError
    if (!claimed) {
      const { data: ledger, error: ledgerError } = await db
        .from('stripe_webhook_events')
        .select('status')
        .eq('stripe_event_id', event.id)
        .single()
      if (ledgerError) throw ledgerError
      if (ledger.status === 'processing') {
        // A concurrent worker owns this event. Ask Stripe to retry so a crashed owner
        // cannot turn temporary overlap into permanent event loss.
        return reply({ error: 'Webhook is already processing' }, 500)
      }
      return reply({ received: true, duplicate: true })
    }

    const planByPrice = async (priceId: string) => {
      const { data, error } = await db
        .from('credit_plans')
        .select('id,code,interval')
        .eq('stripe_price_id', priceId)
        .single()
      if (error || !data) {
        throw new Error(`No trusted plan mapped to Stripe price ${priceId}`)
      }
      return data
    }
    const resolveAccount = async (
      customerId: string | null,
      metadataId: string | null,
    ) => {
      if (metadataId) return metadataId
      if (!customerId) return null
      const { data, error } = await db
        .from('billing_customers')
        .select('account_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (error) throw error
      if (data?.account_id) return data.account_id
      const customer = await stripe.customers.retrieve(customerId)
      return !customer.deleted ? (customer.metadata?.account_id ?? null) : null
    }
    const syncSubscription = async (subscription: Stripe.Subscription) => {
      const priceId = subscription.items.data[0]?.price.id
      if (!priceId) throw new Error('Subscription has no price')
      const plan = await planByPrice(priceId)
      const customerId = stripeId(subscription.customer)
      const accountId = await resolveAccount(
        customerId,
        accountMetadata(subscription),
      )
      if (!accountId) throw new Error('Unable to map subscription to account')
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId)
        if (!customer.deleted) {
          const { error } = await db.from('billing_customers').upsert(
            {
              account_id: accountId,
              stripe_customer_id: customerId,
              email: customer.email,
              name: customer.name,
            },
            { onConflict: 'account_id' },
          )
          if (error) throw error
        }
      }
      const { error } = await db.rpc('sync_stripe_subscription', {
        p_account_id: accountId,
        p_plan_id: plan.id,
        p_subscription_id: subscription.id,
        p_customer_id: customerId,
        p_price_id: priceId,
        p_status: subscription.status,
        p_period_start: unixToIso(subscription.current_period_start),
        p_period_end: unixToIso(subscription.current_period_end),
        p_cancel_at_period_end: subscription.cancel_at_period_end,
        p_event_created_at: eventTime,
      })
      if (error) throw error
      return { accountId, plan, subscription }
    }
    const subscriptionForInvoice = async (invoice: Stripe.Invoice) => {
      const id = stripeId(invoice.subscription)
      if (!id) return null
      return syncSubscription(await stripe.subscriptions.retrieve(id))
    }

    let handled = true
    if (event.type.startsWith('customer.subscription.')) {
      await syncSubscription(event.data.object as Stripe.Subscription)
    } else if (event.type === 'checkout.session.completed') {
      const id = stripeId(
        (event.data.object as Stripe.Checkout.Session).subscription,
      )
      if (id) await syncSubscription(await stripe.subscriptions.retrieve(id))
      else handled = false
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const synced = await subscriptionForInvoice(invoice)
      if (synced) {
        const { error } = await db.rpc('process_paid_stripe_invoice', {
          p_account_id: synced.accountId,
          p_plan_id: synced.plan.id,
          p_subscription_id: synced.subscription.id,
          p_invoice_id: invoice.id,
          p_payment_intent_id: stripeId(invoice.payment_intent),
          p_amount_cents: invoice.amount_paid,
          p_currency: invoice.currency,
          p_invoice_status: invoice.status,
          p_paid_at: unixToIso(
            invoice.status_transitions.paid_at ?? event.created,
          ),
          p_period_start: unixToIso(invoice.period_start),
          p_period_end: unixToIso(invoice.period_end),
          p_event_created_at: eventTime,
        })
        if (error) throw error
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const synced = await subscriptionForInvoice(invoice)
      if (synced) {
        const { error } = await db.rpc('record_failed_stripe_invoice', {
          p_account_id: synced.accountId,
          p_subscription_id: synced.subscription.id,
          p_invoice_id: invoice.id,
          p_payment_intent_id: stripeId(invoice.payment_intent),
          p_amount_cents: invoice.amount_due,
          p_currency: invoice.currency,
          p_invoice_status: invoice.status,
          p_event_created_at: eventTime,
        })
        if (error) throw error
      }
    } else if (event.type === 'charge.refunded') {
      const invoiceId = stripeId((event.data.object as Stripe.Charge).invoice)
      if (invoiceId) {
        const { error } = await db.rpc('process_stripe_refund', {
          p_invoice_id: invoiceId,
          p_event_created_at: eventTime,
        })
        if (error) throw error
      }
    } else handled = false

    const { error: finishError } = await db
      .from('stripe_webhook_events')
      .update({
        status: handled ? 'processed' : 'ignored',
        processed_at: new Date().toISOString(),
        processing_token: null,
      })
      .eq('stripe_event_id', event.id)
      .eq('processing_token', processingToken)
    if (finishError) throw finishError
    return reply({ received: true })
  } catch (error) {
    console.error('Stripe webhook failed', error)
    try {
      const url = Deno.env.get('SUPABASE_URL')
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (url && key && eventId && processingToken) {
        await createClient(url, key)
          .from('stripe_webhook_events')
          .update({
            status: 'failed',
            error_message: String(error).slice(0, 2000),
            processing_token: null,
          })
          .eq('stripe_event_id', eventId)
          .eq('processing_token', processingToken)
      }
    } catch {
      /* preserve original failure */
    }
    return reply({ error: 'Webhook processing failed' }, 500)
  }
})
