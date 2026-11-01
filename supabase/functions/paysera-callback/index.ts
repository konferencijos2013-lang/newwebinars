import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { requireEnv } from '../_shared/billing.ts'
import { payseraDecode, payseraSign } from '../../../src/features/billing/offerPayment.ts'

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return text('ERROR', 405)
  try {
    const params = req.method === 'POST'
      ? new URLSearchParams(await req.text())
      : new URL(req.url).searchParams
    const data = params.get('data') ?? ''
    const signature = params.get('ss1') ?? params.get('sign') ?? ''
    if (!data || !signature) return text('ERROR', 400)

    const decoded = new URLSearchParams(payseraDecode(data))
    const orderId = decoded.get('orderid') ?? ''
    const admin = createClient(
      requireEnv(Deno.env.get, 'SUPABASE_URL'),
      requireEnv(Deno.env.get, 'SUPABASE_SERVICE_ROLE_KEY'),
    )
    const { data: order } = await admin
      .from('offer_orders')
      .select('id, account_id, registration_id, amount_cents, status, provider')
      .eq('id', orderId)
      .eq('provider', 'paysera')
      .maybeSingle()
    if (!order) return text('ERROR', 404)

    const { data: connection } = await admin
      .from('integration_connections')
      .select('id, config')
      .eq('account_id', order.account_id)
      .eq('provider', 'paysera')
      .eq('status', 'active')
      .maybeSingle()
    if (!connection) return text('ERROR', 404)
    const { data: password } = await admin.rpc('get_integration_secret', {
      p_connection_id: connection.id,
    })
    if (typeof password !== 'string' || payseraSign(data, password) !== signature) {
      return text('ERROR', 400)
    }
    const projectId = String((connection.config as { project_id?: string } | null)?.project_id ?? '')
    const paid = decoded.get('status') === '1'
      && decoded.get('projectid') === projectId
      && decoded.get('currency') === 'EUR'
      && Number(decoded.get('amount')) === order.amount_cents
    if (!paid) return text('OK')
    if (order.status !== 'paid') {
      const paidAt = new Date().toISOString()
      await admin
        .from('offer_orders')
        .update({ status: 'paid', external_id: decoded.get('requestid'), paid_at: paidAt })
        .eq('id', order.id)
        .eq('status', 'pending')
      if (order.registration_id) {
        await admin
          .from('registrations')
          .update({ offer_paid_at: paidAt })
          .eq('id', order.registration_id)
          .is('offer_paid_at', null)
      }
    }
    return text('OK')
  } catch (error) {
    console.error('Paysera callback failed', error)
    return text('ERROR', 500)
  }
})
