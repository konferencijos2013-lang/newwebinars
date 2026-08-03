import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Authentication required' }, 401)
    const { account_id, plan_id, success_url, cancel_url } = await req.json()
    if (!account_id || !plan_id || !success_url || !cancel_url)
      return json({ error: 'Missing required fields' }, 400)

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: auth, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !auth.user)
      return json({ error: 'Authentication required' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: membership } = await supabaseAdmin
      .from('account_members')
      .select('role')
      .eq('account_id', account_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (!membership || !['owner', 'admin'].includes(membership.role))
      return json(
        { error: 'Only account owners or admins can manage billing' },
        403,
      )

    const origin = new URL(req.headers.get('origin') ?? '').origin
    if (
      !origin ||
      ![success_url, cancel_url].every((url: string) => {
        try {
          return new URL(url).origin === origin
        } catch {
          return false
        }
      })
    )
      return json({ error: 'Invalid redirect URL' }, 400)

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const { data: plan, error: planError } = await supabaseAdmin
      .from('credit_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single()
    if (planError || !plan) return json({ error: 'Plan not found' }, 404)
    if (!plan.stripe_price_id)
      return json({ error: 'Plan has no Stripe price' }, 400)

    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id, owner_id')
      .eq('id', account_id)
      .single()
    if (!account) return json({ error: 'Account not found' }, 404)
    const { data: existingCustomer } = await supabaseAdmin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('account_id', account_id)
      .maybeSingle()
    let customerId = existingCustomer?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        metadata: { account_id },
      })
      customerId = customer.id
      const { error } = await supabaseAdmin
        .from('billing_customers')
        .upsert(
          {
            account_id,
            stripe_customer_id: customerId,
            email: auth.user.email,
          },
          { onConflict: 'account_id' },
        )
      if (error) throw error
    }

    const { data: attribution } = await supabaseAdmin
      .from('platform_partner_attributions')
      .select('id')
      .eq('account_id', account_id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    const metadata = {
      account_id,
      plan_id,
      ...(attribution ? { affiliate_attribution_id: attribution.id } : {}),
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url,
      cancel_url,
      metadata,
      subscription_data: { metadata },
    })
    return json({ url: session.url })
  } catch (err) {
    console.error('Checkout creation failed', err)
    return json({ error: 'Unable to create checkout session' }, 500)
  }
})
