import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const payload = await req.text()
  let event

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    )
  } catch (err) {
    return new Response(
      `Webhook signature verification failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { status: 400 },
    )
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const accountId = session.metadata?.account_id
      const planId = session.metadata?.plan_id

      if (!accountId || !planId) {
        return new Response('Missing metadata', { status: 400 })
      }

      await supabaseAdmin.from('subscriptions').upsert(
        {
          account_id: accountId,
          credit_plan_id: planId,
          stripe_subscription_id: session.subscription?.toString(),
          stripe_price_id: session.metadata?.stripe_price_id,
          status: 'active',
          current_period_start: new Date(
            Number(session.subscription_details?.trial_start ?? 0) * 1000,
          ).toISOString(),
          current_period_end: new Date(
            Number(session.subscription_details?.trial_end ?? 0) * 1000,
          ).toISOString(),
        },
        { onConflict: 'stripe_subscription_id' },
      )

      await supabaseAdmin
        .from('accounts')
        .update({ plan: 'paid' })
        .eq('id', accountId)
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription?.toString()
      if (!subscriptionId) return new Response('OK', { status: 200 })

      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('account_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single()

      if (sub) {
        await supabaseAdmin.from('payments').insert({
          account_id: sub.account_id,
          subscription_id: subscriptionId,
          stripe_payment_intent_id: invoice.payment_intent?.toString(),
          stripe_invoice_id: invoice.id,
          amount_cents: invoice.amount_due,
          currency: invoice.currency,
          status: 'succeeded',
          paid_at: new Date().toISOString(),
        })

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: new Date(
              invoice.period_start * 1000,
            ).toISOString(),
            current_period_end: new Date(
              invoice.period_end * 1000,
            ).toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
