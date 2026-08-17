import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function stringAt(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object') return ''
  const source = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = source[key]
    if (typeof candidate === 'string' && candidate.trim())
      return candidate.trim()
    if (typeof candidate === 'number') return String(candidate)
  }
  return ''
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const connectionId =
    req.headers.get('x-manychat-connection-id') ??
    new URL(req.url).searchParams.get('connection_id')
  const webhookSecret = req.headers.get('x-manychat-webhook-secret')
  const expectedSecret = Deno.env.get('MANYCHAT_WEBHOOK_SECRET')
  if (!expectedSecret || webhookSecret !== expectedSecret || !connectionId) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected JSON payload' }, 400)
  }
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : payload
  const linkToken =
    stringAt(data, ['manychat_link_token', 'link_token', 'token']) ||
    stringAt(payload, ['manychat_link_token', 'link_token', 'token'])
  const subscriberId =
    stringAt(data, ['subscriber_id', 'subscriberId', 'contact_id']) ||
    stringAt(payload, ['subscriber_id', 'subscriberId', 'contact_id'])
  const channel =
    stringAt(data, ['channel', 'platform']) ||
    stringAt(payload, ['channel', 'platform']) ||
    'other'
  const eventId =
    stringAt(data, ['event_id', 'eventId']) ||
    stringAt(payload, ['event_id', 'eventId'])
  if (!linkToken || !subscriberId)
    return json({ error: 'Missing linking token or subscriber ID' }, 400)

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  if (eventId) {
    const { error } = await db.from('manychat_webhook_events').insert({
      integration_connection_id: connectionId,
      event_id: eventId,
      payload,
    })
    if (error?.code === '23505')
      return json({ received: true, duplicate: true })
    if (error) return json({ error: 'Unable to record webhook' }, 500)
  }

  const { data: result, error } = await db.rpc('link_manychat_subscriber', {
    p_connection_id: connectionId,
    p_link_token: linkToken,
    p_subscriber_id: subscriberId,
    p_channel: channel,
  })
  if (error) {
    if (eventId)
      await db
        .from('manychat_webhook_events')
        .delete()
        .eq('integration_connection_id', connectionId)
        .eq('event_id', eventId)
    console.error('ManyChat linking failed', error)
    return json({ error: 'Unable to link participant' }, 500)
  }
  return json({ received: true, status: result })
})
