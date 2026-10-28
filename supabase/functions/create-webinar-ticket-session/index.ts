import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@14.4.0?target=deno'
import { requireEnv, UUID_PATTERN } from '../_shared/billing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabaseUrl = requireEnv(Deno.env.get, 'SUPABASE_URL')
    const serviceKey = requireEnv(Deno.env.get, 'SUPABASE_SERVICE_ROLE_KEY')
    const stripeKey = requireEnv(Deno.env.get, 'STRIPE_SECRET_KEY')
    const appUrl = requireEnv(Deno.env.get, 'APP_URL').replace(/\/$/, '')
    const body = await req.json()
    const accessToken = body.access_token
    if (typeof accessToken !== 'string' || !UUID_PATTERN.test(accessToken)) {
      return json({ error: 'Missing registration token' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: registration, error } = await admin
      .from('registrations')
      .select('id, email, paid_at, payment_required, webinar_id')
      .eq('access_token', accessToken)
      .maybeSingle()
    if (error || !registration) return json({ error: 'Registration not found' }, 404)
    if (!registration.payment_required) {
      return json({ error: 'Payment is not required' }, 400)
    }
    if (registration.paid_at) return json({ already_paid: true })

    const { data: webinar, error: webinarError } = await admin
      .from('webinars')
      .select('id, title, slug, price_cents, access_mode')
      .eq('id', registration.webinar_id)
      .single()
    if (
      webinarError ||
      !webinar ||
      webinar.access_mode !== 'paid_access' ||
      !webinar.price_cents ||
      webinar.price_cents <= 0
    ) {
      return json({ error: 'Paid access is not configured' }, 400)
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const returnPath = `/${webinar.slug}/waiting-room?token=${encodeURIComponent(accessToken)}`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: registration.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: webinar.price_cents,
            product_data: { name: webinar.title },
          },
        },
      ],
      success_url: `${appUrl}${returnPath}&paid=1`,
      cancel_url: `${appUrl}/${webinar.slug}?payment=cancelled`,
      metadata: {
        kind: 'webinar_ticket',
        registration_id: registration.id,
        webinar_id: webinar.id,
      },
    })
    if (!session.url) return json({ error: 'Checkout did not start' }, 500)
    return json({ url: session.url })
  } catch (error) {
    console.error('Webinar ticket checkout failed', error)
    return json({ error: 'Checkout failed' }, 500)
  }
})
