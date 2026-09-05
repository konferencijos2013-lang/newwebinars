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

function telegramError(value: unknown) {
  if (!value || typeof value !== 'object') return 'Telegram rejected delivery.'
  const description = (value as Record<string, unknown>).description
  return typeof description === 'string'
    ? description.slice(0, 300)
    : 'Telegram rejected delivery.'
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentication required' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const authClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: auth } = await authClient.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  )
  if (!auth.user) return json({ error: 'Authentication required' }, 401)

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'Expected JSON payload' }, 400)
  }
  const connectionId = payload.connection_id
  const message =
    typeof payload.message === 'string' ? payload.message.trim() : ''
  const contactIds = payload.contact_ids
  if (typeof connectionId !== 'string' || !UUID_PATTERN.test(connectionId))
    return json({ error: 'Invalid Telegram connection' }, 400)
  if (!message || message.length > 4096)
    return json(
      { error: 'Message must contain between 1 and 4096 characters' },
      400,
    )
  if (
    !Array.isArray(contactIds) ||
    contactIds.length < 1 ||
    contactIds.length > 100 ||
    contactIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
  ) {
    return json({ error: 'Select between 1 and 100 Telegram contacts' }, 400)
  }
  const uniqueContactIds = [...new Set(contactIds as string[])]

  const admin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: connection } = await admin
    .from('integration_connections')
    .select('id,account_id,status')
    .eq('id', connectionId)
    .eq('provider', 'telegram')
    .maybeSingle()
  if (!connection || connection.status !== 'active')
    return json({ error: 'Active Telegram connection not found' }, 404)

  const [{ data: membership }, { data: profile }] = await Promise.all([
    admin
      .from('account_members')
      .select('role')
      .eq('account_id', connection.account_id)
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle(),
  ])
  if (
    !['owner', 'admin'].includes(membership?.role ?? '') &&
    profile?.role !== 'admin'
  ) {
    return json({ error: 'Not authorized' }, 403)
  }

  const { data: contacts, error: contactsError } = await admin
    .from('telegram_contacts')
    .select('id,chat_id')
    .eq('account_id', connection.account_id)
    .eq('integration_connection_id', connectionId)
    .eq('status', 'active')
    .not('broadcast_opted_in_at', 'is', null)
    .in('id', uniqueContactIds)
  if (contactsError) return json({ error: 'Unable to load contacts' }, 500)
  if ((contacts ?? []).length !== uniqueContactIds.length)
    return json({ error: 'One or more selected contacts are unavailable' }, 400)

  const { data: botToken } = await admin.rpc('get_integration_secret', {
    p_connection_id: connectionId,
  })
  if (!botToken) return json({ error: 'Bot token is unavailable' }, 400)

  let sent = 0
  let failed = 0
  let blocked = 0
  const failures: Array<{ contact_id: string; error: string }> = []
  for (const contact of contacts ?? []) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: contact.chat_id,
            text: message,
            disable_web_page_preview: false,
          }),
        },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.ok) {
        const error = telegramError(result)
        if (response.status === 403) {
          blocked++
          await admin
            .from('telegram_contacts')
            .update({ status: 'blocked', updated_at: new Date().toISOString() })
            .eq('id', contact.id)
            .eq('integration_connection_id', connectionId)
        } else {
          failed++
        }
        failures.push({ contact_id: contact.id, error })
      } else {
        sent++
      }
    } catch {
      failed++
      failures.push({
        contact_id: contact.id,
        error: 'Telegram request failed.',
      })
    }
  }

  const { error: auditError } = await admin.from('telegram_broadcasts').insert({
    account_id: connection.account_id,
    integration_connection_id: connectionId,
    sent_by: auth.user.id,
    message,
    recipient_count: uniqueContactIds.length,
    sent_count: sent,
    failed_count: failed,
    blocked_count: blocked,
  })
  if (auditError)
    console.error('Unable to record Telegram broadcast', auditError)

  return json({
    requested: uniqueContactIds.length,
    sent,
    failed,
    blocked,
    failures: failures.slice(0, 20),
  })
})
