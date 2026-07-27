import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Cloudflare signs webhook deliveries with `Webhook-Signature: time=...,sig1=...`
// using the secret returned by `GET /accounts/{id}/stream/webhook`. See
// https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/#verify-webhook-authenticity
async function verifySignature(body: string, header: string | null, secret: string) {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=') as [string, string]),
  )
  const time = parts['time']
  const receivedSig = parts['sig1']
  if (!time || !receivedSig) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${time}.${body}`),
  )
  const expectedSig = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (expectedSig.length !== receivedSig.length) return false
  let mismatch = 0
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ receivedSig.charCodeAt(i)
  }
  return mismatch === 0
}

serve(async (req) => {
  try {
    const rawBody = await req.text()

    const webhookSecret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET')
    if (webhookSecret) {
      const valid = await verifySignature(
        rawBody,
        req.headers.get('Webhook-Signature'),
        webhookSecret,
      )
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const payload = JSON.parse(rawBody)
    // Live input connect/disconnect/error events (delivered via the
    // Notifications/Alerting API) nest their fields under `data`. Video
    // asset processing events (delivered via the plain Stream webhook) are
    // flat instead, so accept both shapes defensively.
    const inputUid =
      payload?.data?.input_id ?? payload?.inputUID ?? payload?.live_input_uid
    const eventType = payload?.data?.event_type ?? payload?.event_type

    if (!inputUid || !eventType) {
      return new Response(
        JSON.stringify({ error: 'Missing inputUID or event_type' }),
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

    const { data: webinar } = await supabaseAdmin
      .from('webinars')
      .select('id, account_id')
      .eq('cf_live_input_uid', inputUid)
      .single()

    if (!webinar) {
      return new Response(
        JSON.stringify({ error: 'Webinar not found for input' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const now = new Date().toISOString()

    if (eventType === 'live_input.connected') {
      await supabaseAdmin
        .from('webinars')
        .update({ cf_stream_status: 'live' })
        .eq('id', webinar.id)

      await supabaseAdmin
        .from('webinar_live_sessions')
        .update({ status: 'live', started_at: now })
        .eq('cf_live_input_uid', inputUid)
        .eq('status', 'pending')

      await supabaseAdmin.channel(`webinar:${webinar.id}`).send({
        type: 'broadcast',
        event: 'stream_status',
        payload: { status: 'live' },
      })
    }

    if (eventType === 'live_input.disconnected') {
      const { data: session } = await supabaseAdmin
        .from('webinar_live_sessions')
        .select('id, started_at')
        .eq('cf_live_input_uid', inputUid)
        .in('status', ['pending', 'live'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (session) {
        const startedAt = session.started_at
          ? new Date(session.started_at)
          : new Date()
        const durationSeconds = Math.max(
          0,
          Math.floor((new Date(now).getTime() - startedAt.getTime()) / 1000),
        )

        await supabaseAdmin
          .from('webinar_live_sessions')
          .update({
            status: 'ended',
            ended_at: now,
            duration_seconds: durationSeconds,
          })
          .eq('id', session.id)

        await supabaseAdmin.rpc('emit_live_session_usage', {
          p_session_id: session.id,
        })
      }

      await supabaseAdmin
        .from('webinars')
        .update({ cf_stream_status: 'ended' })
        .eq('id', webinar.id)

      await supabaseAdmin.channel(`webinar:${webinar.id}`).send({
        type: 'broadcast',
        event: 'stream_status',
        payload: { status: 'ended' },
      })
    }

    if (eventType === 'live_input.errored') {
      await supabaseAdmin
        .from('webinars')
        .update({ cf_stream_status: 'errored' })
        .eq('id', webinar.id)

      await supabaseAdmin
        .from('webinar_live_sessions')
        .update({ status: 'errored' })
        .eq('cf_live_input_uid', inputUid)
        .in('status', ['pending', 'live'])

      await supabaseAdmin.channel(`webinar:${webinar.id}`).send({
        type: 'broadcast',
        event: 'stream_status',
        payload: { status: 'errored' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
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
