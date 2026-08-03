import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import nodemailer from 'npm:nodemailer@6.9.16'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Config = Record<string, unknown>

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

function render(template: string | null, values: Record<string, string>) {
  return (template ?? '').replace(
    /{{\s*(\w+)\s*}}/g,
    (_, key) => values[key] ?? '',
  )
}

function html(textValue: string) {
  return textValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
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
  return responseText
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
  return responseText
}

async function sendManyChat(
  credential: string,
  config: Config,
  subscriberId: string,
  body: string,
) {
  const apiBaseUrl = text(config, 'api_base_url') || 'https://api.manychat.com'
  const endpoint = text(config, 'send_endpoint') || '/fb/sending/sendContent'
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      subscriber_id: subscriberId,
      data: { version: 'v2', content: { type: 'text', text: body } },
    }),
  })
  const responseText = await response.text()
  if (!response.ok)
    throw new Error(`ManyChat rejected delivery: ${responseText}`)
  return responseText
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
  const result = await transport.sendMail({
    from,
    to,
    subject,
    text: body,
    html: html(body),
  })
  return JSON.stringify({
    messageId: result.messageId,
    accepted: result.accepted,
  })
}

serve(async (req) => {
  const expected = Deno.env.get('DELIVERY_WORKER_SECRET')
  if (!expected || req.headers.get('x-delivery-worker-secret') !== expected)
    return json({ error: 'Unauthorized' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: jobs, error } = await db.rpc('claim_due_reminders', {
    p_limit: 50,
  })
  if (error) return json({ error: 'Unable to claim reminders' }, 500)

  let sent = 0
  let failed = 0
  let skipped = 0
  for (const job of jobs ?? []) {
    try {
      const { data: credential, error: secretError } = await db.rpc(
        'get_integration_secret',
        { p_connection_id: job.connection_id },
      )
      if (secretError || !credential)
        throw new Error('Integration credential is unavailable')
      const host = job.public_hostname || 'newwebinars.com'
      const publicWebinarLink = `https://${host}/${job.webinar_slug}`
      const webinarLink = `${publicWebinarLink}/waiting-room?token=${job.access_token}`
      const values = {
        name: job.full_name ?? '',
        email: job.email,
        webinar_title: job.webinar_title ?? '',
        webinar_link: webinarLink,
        public_webinar_link: publicWebinarLink,
      }
      const subject =
        render(job.subject, values) || `Reminder: ${values.webinar_title}`
      const body =
        render(job.body, values) ||
        `Your webinar ${values.webinar_title} starts soon.`
      const config = (job.provider_config ?? {}) as Config
      let responseText: string
      if (job.provider === 'brevo')
        responseText = await sendBrevo(
          credential,
          config,
          job.email,
          subject,
          body,
        )
      else if (job.provider === 'resend')
        responseText = await sendResend(
          credential,
          config,
          job.email,
          subject,
          body,
        )
      else if (job.provider === 'smtp')
        responseText = await sendSmtp(
          credential,
          config,
          job.email,
          subject,
          body,
        )
      else if (job.provider === 'manychat') {
        if (
          job.manychat_channel_status !== 'linked' ||
          !job.manychat_subscriber_id
        ) {
          await db.rpc('complete_reminder_delivery', {
            p_queue_id: job.queue_id,
            p_status: 'skipped',
            p_provider_response: null,
            p_error_message:
              'Participant did not connect a supported ManyChat channel before this reminder.',
          })
          skipped++
          continue
        }
        responseText = await sendManyChat(
          credential,
          config,
          job.manychat_subscriber_id,
          body,
        )
        await db
          .from('registration_message_channels')
          .update({
            last_delivery_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('registration_id', job.registration_id)
          .eq('integration_connection_id', job.connection_id)
          .eq('provider', 'manychat')
      } else throw new Error(`Unsupported reminder provider: ${job.provider}`)
      await db.rpc('complete_reminder_delivery', {
        p_queue_id: job.queue_id,
        p_status: 'sent',
        p_provider_response: responseText,
        p_error_message: null,
      })
      sent++
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      await db.rpc('complete_reminder_delivery', {
        p_queue_id: job.queue_id,
        p_status: 'failed',
        p_provider_response: null,
        p_error_message: message,
      })
      failed++
    }
  }
  return json({ claimed: (jobs ?? []).length, sent, failed, skipped })
})
