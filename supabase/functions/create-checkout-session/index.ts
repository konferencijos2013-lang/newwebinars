import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'

serve(async (req) => {
  try {
    const { account_id, plan_id, success_url, cancel_url } = await req.json()
    if (!account_id || !plan_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const { data: plan, error: planError } = await supabaseAdmin
      .from('credit_plans')
      .select('*')
      .eq('id', plan_id)
      .single()

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!plan.stripe_price_id) {
      return new Response(
        JSON.stringify({ error: 'Plan has no Stripe price' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id, owner_id')
      .eq('id', account_id)
      .single()

    if (!account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: existingCustomer } = await supabaseAdmin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('account_id', account_id)
      .single()

    let customerId = existingCustomer?.stripe_customer_id

    if (!customerId) {
      const user = await supabaseAdmin.auth.admin.getUserById(account.owner_id)
      const customer = await stripe.customers.create({
        email: user.data.user?.email,
        metadata: { account_id },
      })
      customerId = customer.id
      await supabaseAdmin.from('billing_customers').insert({
        account_id,
        stripe_customer_id: customerId,
        email: user.data.user?.email,
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: { account_id, plan_id },
      subscription_data: {
        metadata: { account_id, plan_id },
      },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
