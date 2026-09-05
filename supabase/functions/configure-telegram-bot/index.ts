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
    {
      global: { headers: { Authorization: authorization } },
    },
  )
  const { data: auth } = await authClient.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  )
  if (!auth.user) return json({ error: 'Authentication required' }, 401)

  const { connection_id: connectionId } = await req.json()
  if (typeof connectionId !== 'string')
    return json({ error: 'Missing connection' }, 400)
  const admin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: connection } = await admin
    .from('integration_connections')
    .select('id,account_id,config')
    .eq('id', connectionId)
    .eq('provider', 'telegram')
    .maybeSingle()
  if (!connection) return json({ error: 'Telegram connection not found' }, 404)
  const { data: membership } = await admin
    .from('account_members')
    .select('role')
    .eq('account_id', connection.account_id)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (
    !['owner', 'admin'].includes(membership?.role ?? '') &&
    profile?.role !== 'admin'
  ) {
    return json({ error: 'Not authorized' }, 403)
  }

  const { data: botToken } = await admin.rpc('get_integration_secret', {
    p_connection_id: connectionId,
  })
  if (!botToken) return json({ error: 'Bot token is unavailable' }, 400)
  const botResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getMe`,
  )
  const botResult = await botResponse.json()
  const username = botResult?.result?.username
  if (!botResponse.ok || !botResult?.ok || typeof username !== 'string') {
    await admin
      .from('integration_connections')
      .update({
        status: 'error',
        last_error: 'Telegram rejected the bot token.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
    return json({ error: 'Telegram rejected the bot token' }, 400)
  }

  const secretBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${botToken}:${connectionId}`),
  )
  const webhookSecret = Array.from(new Uint8Array(secretBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?connection_id=${encodeURIComponent(connectionId)}`
  const webhookResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    },
  )
  const webhookResult = await webhookResponse.json()
  if (!webhookResponse.ok || !webhookResult?.ok) {
    const description = String(
      webhookResult?.description || 'Unable to configure Telegram webhook',
    )
    await admin
      .from('integration_connections')
      .update({
        status: 'error',
        last_error: description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
    return json({ error: description }, 400)
  }

  const config =
    connection.config && typeof connection.config === 'object'
      ? connection.config
      : {}
  await admin
    .from('integration_connections')
    .update({
      config: {
        ...config,
        bot_username: username,
      },
      status: 'active',
      last_tested_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
  return json({ configured: true, bot_username: username })
})
