import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { requireEnv, UUID_PATTERN } from '../_shared/billing.ts'
import {
  centsToEuros,
  payseraData,
  payseraSign,
} from '../../../src/features/billing/offerPayment.ts'

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

type Provider = 'paysera' | 'stripe' | 'paypal'
type OrderRow = {
  id: string
  account_id: string
  webinar_id: string
  registration_id: string | null
  provider: Provider
  amount_cents: number
  currency: string
  status: 'pending' | 'paid' | 'cancelled'
  external_id: string | null
}

function adminClient() {
  return createClient(
    requireEnv(Deno.env.get, 'SUPABASE_URL'),
    requireEnv(Deno.env.get, 'SUPABASE_SERVICE_ROLE_KEY'),
  )
}

function returnUrl(orderId: string, result: 'accept' | 'cancel') {
  const appUrl = requireEnv(Deno.env.get, 'APP_URL').replace(/\/$/, '')
  return `${appUrl}/pay/offer?order=${orderId}&result=${result}`
}

async function connectionFor(admin: SupabaseClient, accountId: string, provider: Provider) {
  const { data, error } = await admin
    .from('integration_connections')
    .select('id, config, status')
    .eq('account_id', accountId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) throw new Error('Payment provider is not connected')
  const { data: secret, error: secretError } = await admin.rpc(
    'get_integration_secret',
    { p_connection_id: data.id },
  )
  if (secretError || typeof secret !== 'string' || secret.length < 8) {
    throw new Error('Payment credential is missing')
  }
  return { config: (data.config ?? {}) as Record<string, unknown>, secret }
}

async function markPaid(admin: SupabaseClient, order: OrderRow, externalId: string) {
  if (order.status === 'paid') return
  const paidAt = new Date().toISOString()
  const { error } = await admin
    .from('offer_orders')
    .update({ status: 'paid', external_id: externalId, paid_at: paidAt })
    .eq('id', order.id)
    .eq('status', 'pending')
    .eq('amount_cents', order.amount_cents)
  if (error) throw error
  if (order.registration_id) {
    await admin
      .from('registrations')
      .update({ offer_paid_at: paidAt, offer_clicked_at: paidAt })
      .eq('id', order.registration_id)
      .is('offer_paid_at', null)
  }
}

async function loadOrder(admin: SupabaseClient, orderId: string) {
  if (!UUID_PATTERN.test(orderId)) throw new Error('Unknown payment')
  const { data, error } = await admin
    .from('offer_orders')
    .select('id, account_id, webinar_id, registration_id, provider, amount_cents, currency, status, external_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !data) throw new Error('Unknown payment')
  return data as OrderRow
}

async function continueUrl(admin: SupabaseClient, order: OrderRow) {
  const { data } = await admin
    .from('webinar_offers')
    .select('target_url')
    .eq('webinar_id', order.webinar_id)
    .maybeSingle()
  const url = data?.target_url
  if (typeof url === 'string' && /^https:\/\//i.test(url)) return url
  return null
}

async function startPaysera(order: OrderRow, title: string, email: string | null, projectId: string, password: string, test: boolean) {
  const params: Record<string, string> = {
    projectid: projectId,
    orderid: order.id,
    accepturl: returnUrl(order.id, 'accept'),
    cancelurl: returnUrl(order.id, 'cancel'),
    callbackurl: `${requireEnv(Deno.env.get, 'SUPABASE_URL').replace(/\/$/, '')}/functions/v1/paysera-callback`,
    version: '1.6',
    amount: String(order.amount_cents),
    currency: 'EUR',
    paytext: title.slice(0, 120) || 'Webinar offer',
  }
  if (email) params.p_email = email
  if (test) params.test = '1'
  const data = payseraData(params)
  const sign = payseraSign(data, password)
  return `https://www.paysera.com/pay/?data=${encodeURIComponent(data)}&sign=${sign}`
}

async function startStripe(order: OrderRow, title: string, email: string | null, secretKey: string) {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(order.amount_cents),
    'line_items[0][price_data][product_data][name]': title.slice(0, 120) || 'Webinar offer',
    success_url: `${returnUrl(order.id, 'accept')}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl(order.id, 'cancel'),
    'metadata[order_id]': order.id,
  })
  if (email) body.set('customer_email', email)
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const payload = await response.json()
  if (!response.ok || typeof payload.url !== 'string') {
    throw new Error('Stripe checkout did not start')
  }
  return { url: payload.url as string, externalId: String(payload.id ?? '') }
}

async function paypalToken(clientId: string, secret: string, sandbox: boolean) {
  const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const payload = await response.json()
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error('PayPal login failed')
  }
  return { base, token: payload.access_token as string }
}

async function startPaypal(order: OrderRow, clientId: string, secret: string, sandbox: boolean) {
  const { base, token } = await paypalToken(clientId, secret, sandbox)
  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: order.id,
          invoice_id: order.id,
          amount: { currency_code: 'EUR', value: centsToEuros(order.amount_cents) },
        },
      ],
      application_context: {
        return_url: returnUrl(order.id, 'accept'),
        cancel_url: returnUrl(order.id, 'cancel'),
        user_action: 'PAY_NOW',
      },
    }),
  })
  const payload = await response.json()
  const approve = Array.isArray(payload.links)
    ? payload.links.find((link: { rel?: string; href?: string }) => link.rel === 'approve')
    : null
  if (!response.ok || typeof approve?.href !== 'string') {
    throw new Error('PayPal checkout did not start')
  }
  return { url: approve.href as string, externalId: String(payload.id ?? '') }
}

async function confirmStripe(order: OrderRow, secretKey: string, sessionId: string) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  )
  const payload = await response.json()
  if (!response.ok) throw new Error('Stripe payment could not be confirmed')
  if (
    payload.payment_status !== 'paid' ||
    payload.amount_total !== order.amount_cents ||
    payload.metadata?.order_id !== order.id
  ) {
    return false
  }
  return true
}

async function confirmPaypal(order: OrderRow, clientId: string, secret: string, sandbox: boolean, paypalOrderId: string) {
  const { base, token } = await paypalToken(clientId, secret, sandbox)
  const captureResponse = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const response = captureResponse.ok
    ? captureResponse
    : await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  const payload = await response.json()
  const unit = payload.purchase_units?.[0]
  const capture = unit?.payments?.captures?.[0]
  if (
    payload.status !== 'COMPLETED' ||
    unit?.custom_id !== order.id ||
    capture?.amount?.currency_code !== 'EUR' ||
    capture?.amount?.value !== centsToEuros(order.amount_cents)
  ) {
    return false
  }
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const admin = adminClient()
    const body = await req.json()
    if (body.action === 'confirm') {
      const order = await loadOrder(admin, String(body.order_id ?? ''))
      if (order.status !== 'paid') {
        const connection = await connectionFor(admin, order.account_id, order.provider)
        let confirmed = false
        if (order.provider === 'stripe' && typeof body.session_id === 'string') {
          confirmed = await confirmStripe(order, connection.secret, body.session_id)
        } else if (order.provider === 'paypal' && typeof body.paypal_order_id === 'string') {
          const clientId = String(connection.config.client_id ?? '')
          confirmed = await confirmPaypal(
            order,
            clientId,
            connection.secret,
            connection.config.sandbox === true,
            body.paypal_order_id,
          )
        }
        if (confirmed) await markPaid(admin, order, String(body.session_id ?? body.paypal_order_id))
      }
      const fresh = await loadOrder(admin, order.id)
      return json({
        status: fresh.status,
        continue_url: fresh.status === 'paid' ? await continueUrl(admin, fresh) : null,
      })
    }

    const accessToken = body.access_token
    if (typeof accessToken !== 'string' || !UUID_PATTERN.test(accessToken)) {
      return json({ error: 'Missing registration token' }, 400)
    }
    const { data: registration, error } = await admin
      .from('registrations')
      .select('id, email, webinar_id')
      .eq('access_token', accessToken)
      .maybeSingle()
    if (error || !registration) return json({ error: 'Registration not found' }, 404)

    const { data: webinar, error: webinarError } = await admin
      .from('webinars')
      .select('id, account_id, title')
      .eq('id', registration.webinar_id)
      .single()
    if (webinarError || !webinar) return json({ error: 'Webinar not found' }, 404)

    const { data: offer } = await admin
      .from('webinar_offers')
      .select('title, price_cents, active')
      .eq('webinar_id', webinar.id)
      .maybeSingle()
    if (!offer?.active || !offer.price_cents || offer.price_cents <= 0) {
      return json({ error: 'Offer payment is not configured' }, 400)
    }

    const { data: settings } = await admin
      .from('account_payment_settings')
      .select('provider')
      .eq('account_id', webinar.account_id)
      .maybeSingle()
    const provider = settings?.provider as Provider | undefined
    if (provider !== 'paysera' && provider !== 'stripe' && provider !== 'paypal') {
      return json({ error: 'Choose a payment provider in Integrations' }, 400)
    }
    const connection = await connectionFor(admin, webinar.account_id, provider)

    const { data: created, error: orderError } = await admin
      .from('offer_orders')
      .insert({
        account_id: webinar.account_id,
        webinar_id: webinar.id,
        registration_id: registration.id,
        provider,
        amount_cents: offer.price_cents,
        currency: 'EUR',
      })
      .select('id, account_id, webinar_id, registration_id, provider, amount_cents, currency, status, external_id')
      .single()
    if (orderError || !created) return json({ error: 'Payment could not be created' }, 500)
    const order = created as OrderRow
    const title = String(offer.title || webinar.title || 'Webinar offer')

    let url = ''
    let externalId = ''
    if (provider === 'paysera') {
      const projectId = String(connection.config.project_id ?? '').trim()
      if (!/^\d+$/.test(projectId)) throw new Error('Paysera project id is missing')
      url = await startPaysera(order, title, registration.email, projectId, connection.secret, connection.config.test === true)
    } else if (provider === 'stripe') {
      if (!connection.secret.startsWith('sk_')) throw new Error('Stripe secret key is invalid')
      const started = await startStripe(order, title, registration.email, connection.secret)
      url = started.url
      externalId = started.externalId
    } else {
      const clientId = String(connection.config.client_id ?? '').trim()
      if (!clientId) throw new Error('PayPal client id is missing')
      const started = await startPaypal(order, clientId, connection.secret, connection.config.sandbox === true)
      url = started.url
      externalId = started.externalId
    }
    if (externalId) {
      await admin.from('offer_orders').update({ external_id: externalId }).eq('id', order.id)
    }
    return json({ url })
  } catch (error) {
    console.error('Offer checkout failed', error)
    const message = error instanceof Error ? error.message : 'Checkout failed'
    return json({ error: message }, 500)
  }
})
