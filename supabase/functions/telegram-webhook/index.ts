import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

async function telegramReply(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  if (!connectionId) return json({ error: 'Missing connection' }, 400)

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: connection } = await db
    .from('integration_connections')
    .select('id,status,config')
    .eq('id', connectionId)
    .eq('provider', 'telegram')
    .maybeSingle()
  if (connection?.status !== 'active')
    return json({ error: 'Unauthorized' }, 401)
  const { data: botToken } = await db.rpc('get_integration_secret', {
    p_connection_id: connectionId,
  })
  if (!botToken) return json({ error: 'Unauthorized' }, 401)
  const secretBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${botToken}:${connectionId}`),
  )
  const expectedSecret = Array.from(new Uint8Array(secretBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  if (req.headers.get('x-telegram-bot-api-secret-token') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let payload: Record<string, unknown>
  try {
    payload = asRecord(await req.json())
  } catch {
    return json({ error: 'Expected JSON payload' }, 400)
  }
  const updateId = Number(payload.update_id)
  if (!Number.isSafeInteger(updateId)) return json({ received: true })
  const { error: eventError } = await db
    .from('telegram_webhook_events')
    .insert({
      integration_connection_id: connectionId,
      update_id: updateId,
      payload: {},
    })
  if (eventError?.code === '23505')
    return json({ received: true, duplicate: true })
  if (eventError) return json({ error: 'Unable to record update' }, 500)

  const message = asRecord(payload.message)
  const chat = asRecord(message.chat)
  const from = asRecord(message.from)
  const chatId = stringValue(chat.id)
  const messageText = stringValue(message.text).trim()
  if (!chatId || chat.type !== 'private')
    return json({ received: true, ignored: true })

  if (/^\/stop(?:@\w+)?$/i.test(messageText)) {
    const { data: stopped, error: stopError } = await db.rpc(
      'unsubscribe_telegram_contact',
      { p_connection_id: connectionId, p_chat_id: chatId },
    )
    if (stopError) {
      console.error('Telegram contact unsubscribe failed', stopError)
      return json({ error: 'Unable to unsubscribe participant' }, 500)
    }
    if (stopped) {
      await telegramReply(
        botToken,
        chatId,
        'Priminimai išjungti. Daugiau žinučių iš šio boto negausite.',
      )
    }
    return json({
      received: true,
      status: stopped ? 'unsubscribed' : 'not_linked',
    })
  }

  const match = messageText.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32,64})$/)
  if (!match) return json({ received: true, ignored: true })

  const { data: status, error } = await db.rpc('link_telegram_contact', {
    p_connection_id: connectionId,
    p_link_token: match[1],
    p_chat_id: chatId,
    p_telegram_user_id: stringValue(from.id) || null,
    p_username: stringValue(from.username) || null,
    p_first_name: stringValue(from.first_name) || null,
    p_last_name: stringValue(from.last_name) || null,
    p_language_code: stringValue(from.language_code) || null,
  })
  if (error) {
    console.error('Telegram contact linking failed', error)
    return json({ error: 'Unable to link participant' }, 500)
  }
  if (botToken) {
    await telegramReply(
      botToken,
      chatId,
      status === 'linked'
        ? 'Priminimai prijungti. Apie artėjantį webinarą parašysime čia.'
        : 'Ši susiejimo nuoroda nebegalioja. Grįžkite į webinaro laukimo kambarį ir bandykite dar kartą.',
    )
  }
  return json({ received: true, status })
})
