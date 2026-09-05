import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AdminClient = ReturnType<typeof createClient>

declare const EdgeRuntime:
  { waitUntil: (promise: Promise<unknown>) => void } | undefined

function scheduleNextBatch(broadcastId: string, delayMs = 500) {
  if (typeof EdgeRuntime === 'undefined') {
    console.error('EdgeRuntime is unavailable; scheduled recovery is required')
    return
  }
  const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/send-telegram-message`
  EdgeRuntime.waitUntil(
    new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(delayMs, 500), 60_000)),
    )
      .then(async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'process',
            broadcast_id: broadcastId,
          }),
        })
        if (!response.ok)
          throw new Error(`Unable to schedule next batch: ${response.status}`)
      })
      .catch((error) =>
        console.error('Telegram batch scheduling failed', error),
      ),
  )
}

type Broadcast = {
  id: string
  account_id: string
  integration_connection_id: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  blocked_count: number
  created_at: string
  completed_at: string | null
}

function telegramError(value: unknown) {
  if (!value || typeof value !== 'object') return 'Telegram rejected delivery.'
  const description = (value as Record<string, unknown>).description
  return typeof description === 'string'
    ? description.slice(0, 300)
    : 'Telegram rejected delivery.'
}

async function authorizedBroadcast(
  admin: AdminClient,
  userId: string,
  broadcastId: string,
): Promise<Broadcast | null> {
  const { data: broadcast } = await admin
    .from('telegram_broadcasts')
    .select(
      'id,account_id,integration_connection_id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at',
    )
    .eq('id', broadcastId)
    .maybeSingle()
  if (!broadcast) return null
  const { data: membership } = await admin
    .from('account_members')
    .select('role')
    .eq('account_id', broadcast.account_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!['owner', 'admin'].includes(membership?.role ?? '')) return null
  return broadcast as Broadcast
}

async function summarize(admin: AdminClient, broadcastId: string) {
  const { data, error } = await admin.rpc('summarize_telegram_broadcast', {
    p_broadcast_id: broadcastId,
  })
  if (error) throw error
  return data?.[0] ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentication required' }, 401)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const isServiceRequest = authorization === `Bearer ${serviceRoleKey}`
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const authClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: auth } = isServiceRequest
    ? { data: { user: null } }
    : await authClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  if (!isServiceRequest && !auth.user)
    return json({ error: 'Authentication required' }, 401)
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected JSON payload' }, 400)
  }
  const admin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const action = payload.action

  if (action === 'create') {
    if (!auth.user) return json({ error: 'Authentication required' }, 401)
    const connectionId = payload.connection_id
    const message =
      typeof payload.message === 'string' ? payload.message.trim() : ''
    const audience = payload.audience
    const requestKey = payload.request_key
    const contactIds = payload.contact_ids
    if (typeof connectionId !== 'string' || !UUID_PATTERN.test(connectionId))
      return json({ error: 'Invalid Telegram connection' }, 400)
    if (typeof requestKey !== 'string' || !UUID_PATTERN.test(requestKey))
      return json({ error: 'Invalid request key' }, 400)
    if (!message || Array.from(message).length > 4096)
      return json(
        { error: 'Message must contain between 1 and 4096 characters' },
        400,
      )
    if (audience !== 'all' && audience !== 'selected')
      return json({ error: 'Invalid audience' }, 400)
    if (
      audience === 'selected' &&
      (!Array.isArray(contactIds) ||
        contactIds.length < 1 ||
        contactIds.length > 5000 ||
        contactIds.some(
          (id) => typeof id !== 'string' || !UUID_PATTERN.test(id),
        ))
    ) {
      return json({ error: 'Select between 1 and 5000 Telegram contacts' }, 400)
    }
    const { data: connection } = await admin
      .from('integration_connections')
      .select('id,account_id,status')
      .eq('id', connectionId)
      .eq('provider', 'telegram')
      .maybeSingle()
    if (!connection || connection.status !== 'active')
      return json({ error: 'Active Telegram connection not found' }, 404)
    const { data: membership } = await admin
      .from('account_members')
      .select('role')
      .eq('account_id', connection.account_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (!['owner', 'admin'].includes(membership?.role ?? ''))
      return json({ error: 'Not authorized' }, 403)

    const uniqueContactIds =
      audience === 'selected' ? [...new Set(contactIds as string[])] : null
    const { data: broadcastId, error: enqueueError } = await admin.rpc(
      'enqueue_telegram_broadcast',
      {
        p_account_id: connection.account_id,
        p_connection_id: connectionId,
        p_sent_by: auth.user.id,
        p_message: message,
        p_request_key: requestKey,
        p_contact_ids: uniqueContactIds,
      },
    )
    if (enqueueError || !broadcastId)
      return json(
        { error: enqueueError?.message || 'Unable to create broadcast' },
        400,
      )
    const { data: broadcast, error: broadcastError } = await admin
      .from('telegram_broadcasts')
      .select(
        'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at',
      )
      .eq('id', broadcastId)
      .single()
    if (broadcastError || !broadcast)
      return json({ error: 'Unable to load broadcast' }, 500)
    scheduleNextBatch(broadcast.id)
    return json({ broadcast })
  }

  if (action === 'work') {
    if (!isServiceRequest) return json({ error: 'Not authorized' }, 403)
    const { data: due, error } = await admin.rpc(
      'recover_telegram_broadcasts',
      {
        p_limit: 20,
      },
    )
    if (error) return json({ error: 'Unable to recover broadcasts' }, 500)
    for (const item of due ?? []) scheduleNextBatch(item.broadcast_id)
    return json({ scheduled: due?.length ?? 0 })
  }

  if (action === 'process') {
    const broadcastId = payload.broadcast_id
    if (typeof broadcastId !== 'string' || !UUID_PATTERN.test(broadcastId))
      return json({ error: 'Invalid broadcast' }, 400)
    let broadcast: Broadcast | null
    if (isServiceRequest) {
      const { data, error } = await admin
        .from('telegram_broadcasts')
        .select(
          'id,account_id,integration_connection_id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at',
        )
        .eq('id', broadcastId)
        .maybeSingle()
      if (error) return json({ error: 'Unable to load broadcast' }, 500)
      broadcast = data as Broadcast | null
    } else {
      broadcast = await authorizedBroadcast(admin, auth.user!.id, broadcastId)
    }
    if (!broadcast)
      return json({ error: 'Broadcast not found or not authorized' }, 404)
    if (broadcast.status === 'completed' || broadcast.status === 'cancelled')
      return json({ broadcast })
    const { data: botToken, error: tokenError } = await admin.rpc(
      'get_integration_secret',
      { p_connection_id: broadcast.integration_connection_id },
    )
    if (tokenError) return json({ error: 'Unable to load bot token' }, 500)
    if (!botToken) return json({ error: 'Bot token is unavailable' }, 400)
    const { data: recipients, error: claimError } = await admin.rpc(
      'claim_telegram_broadcast_recipients',
      { p_broadcast_id: broadcastId, p_limit: 20 },
    )
    if (claimError) return json({ error: 'Unable to claim recipients' }, 500)
    const { data: messageRow, error: messageError } = await admin
      .from('telegram_broadcasts')
      .select('message')
      .eq('id', broadcastId)
      .single()
    if (messageError || !messageRow)
      return json({ error: 'Unable to load broadcast message' }, 500)
    for (const recipient of recipients ?? []) {
      let resultStatus: 'sent' | 'failed' | 'blocked' | 'retry' = 'failed'
      let errorMessage: string | null = null
      let retryAfterSeconds: number | null = null
      const { data: eligibleContact } = await admin
        .from('telegram_contacts')
        .select('id')
        .eq('id', recipient.telegram_contact_id)
        .eq('account_id', broadcast.account_id)
        .eq('integration_connection_id', broadcast.integration_connection_id)
        .eq('status', 'active')
        .not('broadcast_opted_in_at', 'is', null)
        .maybeSingle()
      if (!eligibleContact) {
        errorMessage = 'Contact revoked consent or is no longer active.'
      } else {
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              signal: AbortSignal.timeout(10_000),
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: recipient.chat_id,
                text: messageRow?.message,
                disable_web_page_preview: false,
              }),
            },
          )
          const result = await response.json().catch(() => ({}))
          if (response.ok && result?.ok) resultStatus = 'sent'
          else {
            errorMessage = telegramError(result)
            if (response.status === 403) resultStatus = 'blocked'
            else if (response.status === 429 || response.status >= 500) {
              resultStatus = 'retry'
              const retryAfter = result?.parameters?.retry_after
              retryAfterSeconds =
                typeof retryAfter === 'number' ? retryAfter : null
            }
            if (resultStatus === 'blocked') {
              const { error: blockError } = await admin
                .from('telegram_contacts')
                .update({
                  status: 'blocked',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', recipient.telegram_contact_id)
              if (blockError) throw blockError
            }
          }
        } catch {
          resultStatus = 'retry'
          errorMessage = 'Telegram request failed.'
        }
      }
      const { data: completed, error: completionError } = await admin.rpc(
        'complete_telegram_broadcast_recipient',
        {
          p_recipient_id: recipient.recipient_id,
          p_claim_token: recipient.claim_token,
          p_status: resultStatus,
          p_error: errorMessage,
          p_retry_after_seconds: retryAfterSeconds,
        },
      )
      if (completionError) throw completionError
      if (!completed)
        return json({ error: 'Recipient lease expired; retry processing' }, 409)
      // Keep one bot below Telegram's documented global send-rate ceiling.
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    const summary = await summarize(admin, broadcastId)
    if (summary?.status !== 'completed') {
      const { data: nextRecipient, error: nextRecipientError } = await admin
        .from('telegram_broadcast_recipients')
        .select('next_attempt_at')
        .eq('broadcast_id', broadcastId)
        .eq('status', 'queued')
        .order('next_attempt_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (nextRecipientError)
        return json({ error: 'Unable to schedule next batch' }, 500)
      const nextAttemptAt = nextRecipient?.next_attempt_at
        ? new Date(nextRecipient.next_attempt_at).getTime()
        : Date.now() + 60_000
      scheduleNextBatch(broadcastId, nextAttemptAt - Date.now())
    }
    return json({
      broadcast: summary,
      processed: recipients?.length ?? 0,
    })
  }

  return json({ error: 'Invalid action' }, 400)
})
