import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import nodemailer from 'npm:nodemailer@6.9.16'

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

type Config = Record<string, unknown>
type AdminClient = ReturnType<typeof createClient>

declare const EdgeRuntime:
  | { waitUntil: (promise: Promise<unknown>) => void }
  | undefined

function text(config: Config, key: string) {
  const value = config[key]
  return typeof value === 'string' ? value.trim() : ''
}

function number(config: Config, key: string, fallback: number) {
  const value = config[key]
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : fallback
}

function html(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function scheduleNextBatch(broadcastId: string) {
  if (typeof EdgeRuntime === 'undefined') return
  const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/send-email-broadcast`
  EdgeRuntime.waitUntil(
    new Promise((resolve) => setTimeout(resolve, 800))
      .then(async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'process', broadcast_id: broadcastId }),
        })
        if (!response.ok)
          throw new Error(`Unable to schedule next batch: ${response.status}`)
      })
      .catch((error) => console.error('Email batch scheduling failed', error)),
  )
}

async function sendBrevo(
  credential: string,
  config: Config,
  to: string,
  subject: string,
  body: string,
) {
  const senderEmail = text(config, 'from_email')
  if (!senderEmail) throw new Error('Brevo sender email is not configured')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': credential,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: text(config, 'from_name') || undefined,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html(body),
    }),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`Brevo rejected delivery: ${responseText}`)
}

async function sendResend(
  credential: string,
  config: Config,
  to: string,
  subject: string,
  body: string,
) {
  const from = text(config, 'from_email')
  if (!from) throw new Error('Resend sender address is not configured')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html: html(body) }),
  })
  const responseText = await response.text()
  if (!response.ok) throw new Error(`Resend rejected delivery: ${responseText}`)
}

async function sendSmtp(
  credential: string,
  config: Config,
  to: string,
  subject: string,
  body: string,
) {
  const host = text(config, 'host')
  const from = text(config, 'from_email')
  const username = text(config, 'username')
  if (!host || !from || !username)
    throw new Error('SMTP host, sender email, and username are required')
  const transport = nodemailer.createTransport({
    host,
    port: number(config, 'port', 587),
    secure: config.secure === true,
    auth: { user: username, pass: credential },
  })
  await transport.sendMail({
    from,
    to,
    subject,
    text: body,
    html: html(body),
  })
}

function tagQuery(payload: Record<string, unknown>) {
  const raw = payload.tag_conditions
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) return null
  const match = payload.tag_match
  if (!Array.isArray(raw) || raw.length > 20) return 'invalid' as const
  if (match !== 'all' && match !== 'any') return 'invalid' as const
  const seen = new Set<string>()
  const conditions: Array<{ tag_id: string; present: boolean }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return 'invalid' as const
    const tagId = (item as { tag_id?: unknown }).tag_id
    const present = (item as { present?: unknown }).present
    if (typeof tagId !== 'string' || !UUID_PATTERN.test(tagId))
      return 'invalid' as const
    if (typeof present !== 'boolean') return 'invalid' as const
    if (seen.has(tagId)) return 'invalid' as const
    seen.add(tagId)
    conditions.push({ tag_id: tagId, present })
  }
  return { conditions, match }
}

const BROADCAST_COLUMNS =
  'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at,subject'

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
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const action = payload.action

  if (action === 'create') {
    if (!auth.user) return json({ error: 'Authentication required' }, 401)
    const connectionId = payload.connection_id
    const subject =
      typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const message =
      typeof payload.message === 'string' ? payload.message.trim() : ''
    const audience = payload.audience
    const requestKey = payload.request_key
    const contactIds = payload.contact_ids
    const tags = tagQuery(payload)
    if (tags === 'invalid') return json({ error: 'Invalid tags' }, 400)
    if (typeof connectionId !== 'string' || !UUID_PATTERN.test(connectionId))
      return json({ error: 'Invalid email connection' }, 400)
    if (typeof requestKey !== 'string' || !UUID_PATTERN.test(requestKey))
      return json({ error: 'Invalid request key' }, 400)
    if (!subject || subject.length > 200)
      return json({ error: 'Subject must contain between 1 and 200 characters' }, 400)
    if (!message || message.length > 8000)
      return json({ error: 'Message must contain between 1 and 8000 characters' }, 400)
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
    )
      return json({ error: 'Select between 1 and 5000 email contacts' }, 400)

    const { data: connection } = await admin
      .from('integration_connections')
      .select('id,account_id,status,provider')
      .eq('id', connectionId)
      .in('provider', ['brevo', 'resend', 'smtp'])
      .maybeSingle()
    if (!connection || connection.status !== 'active')
      return json({ error: 'Active email connection not found' }, 404)
    const { data: membership } = await admin
      .from('account_members')
      .select('role')
      .eq('account_id', connection.account_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (!['owner', 'admin'].includes(membership?.role ?? ''))
      return json({ error: 'Not authorized' }, 403)

    const { data: broadcastId, error: enqueueError } = await admin.rpc(
      'enqueue_email_broadcast',
      {
        p_account_id: connection.account_id,
        p_connection_id: connectionId,
        p_sent_by: auth.user.id,
        p_subject: subject,
        p_body: message,
        p_request_key: requestKey,
        p_contact_ids:
          audience === 'selected' ? [...new Set(contactIds as string[])] : null,
        p_tag_conditions: audience === 'all' ? tags?.conditions ?? null : null,
        p_tag_match: audience === 'all' ? tags?.match ?? 'all' : 'all',
      },
    )
    if (enqueueError || !broadcastId)
      return json(
        { error: enqueueError?.message || 'Unable to create broadcast' },
        400,
      )
    const { data: broadcast, error: broadcastError } = await admin
      .from('email_broadcasts')
      .select(BROADCAST_COLUMNS)
      .eq('id', broadcastId)
      .single()
    if (broadcastError || !broadcast)
      return json({ error: 'Unable to load broadcast' }, 500)
    scheduleNextBatch(broadcast.id)
    return json({ broadcast })
  }

  if (action === 'process') {
    if (!isServiceRequest) return json({ error: 'Not authorized' }, 403)
    const broadcastId = payload.broadcast_id
    if (typeof broadcastId !== 'string' || !UUID_PATTERN.test(broadcastId))
      return json({ error: 'Invalid broadcast' }, 400)
    const { data: broadcast, error: broadcastError } = await admin
      .from('email_broadcasts')
      .select(
        `${BROADCAST_COLUMNS},account_id,integration_connection_id,body`,
      )
      .eq('id', broadcastId)
      .maybeSingle()
    if (broadcastError || !broadcast)
      return json({ error: 'Unable to load broadcast' }, 500)
    if (broadcast.status === 'completed')
      return json({ broadcast })

    const { data: connection } = await admin
      .from('integration_connections')
      .select('provider,config,status')
      .eq('id', broadcast.integration_connection_id)
      .maybeSingle()
    const { data: credential, error: secretError } = await admin.rpc(
      'get_integration_secret',
      { p_connection_id: broadcast.integration_connection_id },
    )
    if (secretError || !credential || !connection || connection.status !== 'active')
      return json({ error: 'Email connection is unavailable' }, 400)
    const config = (connection.config ?? {}) as Config

    const { data: recipients, error: claimError } = await admin.rpc(
      'claim_email_broadcast_recipients',
      { p_broadcast_id: broadcastId, p_limit: 15 },
    )
    if (claimError) return json({ error: 'Unable to claim recipients' }, 500)

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://newwebinars.com').replace(
      /\/$/,
      '',
    )
    for (const recipient of recipients ?? []) {
      let resultStatus: 'sent' | 'failed' | 'blocked' = 'failed'
      let errorMessage: string | null = null
      const { data: contact } = await admin
        .from('email_contacts')
        .select('status')
        .eq('id', recipient.email_contact_id)
        .eq('account_id', broadcast.account_id)
        .maybeSingle()
      if (contact?.status !== 'active' || !recipient.unsubscribe_token) {
        resultStatus = 'blocked'
        errorMessage = 'Contact is not active.'
      } else {
        const link = `${appUrl}/email/unsubscribe?token=${recipient.unsubscribe_token}`
        const body = `${broadcast.body}\n\nJei nebenorite gauti šių laiškų, atsisakykite: ${link}`
        try {
          if (connection.provider === 'brevo')
            await sendBrevo(credential, config, recipient.email, broadcast.subject, body)
          else if (connection.provider === 'resend')
            await sendResend(credential, config, recipient.email, broadcast.subject, body)
          else if (connection.provider === 'smtp')
            await sendSmtp(credential, config, recipient.email, broadcast.subject, body)
          else throw new Error('Unsupported email provider')
          resultStatus = 'sent'
        } catch (reason) {
          errorMessage = (reason instanceof Error ? reason.message : 'Delivery failed').slice(0, 300)
        }
      }
      const { error: completionError } = await admin.rpc(
        'complete_email_broadcast_recipient',
        {
          p_recipient_id: recipient.recipient_id,
          p_claim_token: recipient.claim_token,
          p_status: resultStatus,
          p_error: errorMessage,
        },
      )
      if (completionError)
        return json({ error: 'Unable to record delivery' }, 500)
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    const { data: updated } = await admin
      .from('email_broadcasts')
      .select(BROADCAST_COLUMNS)
      .eq('id', broadcastId)
      .single()
    if (updated && updated.status !== 'completed') scheduleNextBatch(broadcastId)
    return json({ broadcast: updated })
  }

  return json({ error: 'Unknown action' }, 400)
})
