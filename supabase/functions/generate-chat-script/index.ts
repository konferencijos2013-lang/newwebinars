import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders }
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'openai/gpt-5.6-luna'
const REQUEST_TIMEOUT_MS = 45_000

type GeneratedLine = {
  trigger_seconds: number
  display_name: string
  sender_role: 'attendee' | 'host'
  message: string
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function asLines(value: unknown): GeneratedLine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((line): GeneratedLine[] => {
    if (!line || typeof line !== 'object') return []
    const item = line as Record<string, unknown>
    const role = item.sender_role === 'host' ? 'host' : 'attendee'
    const seconds = Number(item.trigger_seconds)
    const displayName =
      typeof item.display_name === 'string' ? item.display_name.trim() : ''
    const message = typeof item.message === 'string' ? item.message.trim() : ''
    if (!Number.isFinite(seconds) || seconds < 0 || !displayName || !message)
      return []
    return [
      {
        trigger_seconds: Math.round(seconds),
        display_name: displayName.slice(0, 100),
        sender_role: role,
        message: message.slice(0, 1_500),
      },
    ]
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')
    return response({ error: 'Method not allowed' }, 405)

  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return response({ error: 'Authentication required' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return response({ error: 'Invalid JSON body' }, 400)
    }
    if (typeof body.webinar_id !== 'string' || body.webinar_id.length > 100)
      return response({ error: 'A valid webinar_id is required' }, 400)
    const webinarId = body.webinar_id
    const safeCount = Math.max(4, Math.min(Number(body.count) || 16, 40))

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user)
      return response({ error: 'Authentication required' }, 401)

    const { data: webinar, error: webinarError } = await admin
      .from('webinars')
      .select(
        'id, account_id, title, description, duration_minutes, presenter_name',
      )
      .eq('id', webinarId)
      .single()
    if (webinarError || !webinar)
      return response({ error: 'Webinar not found' }, 404)

    const { data: member, error: memberError } = await admin
      .from('account_members')
      .select('role')
      .eq('account_id', webinar.account_id)
      .eq('user_id', userData.user.id)
      .in('role', ['owner', 'admin', 'editor', 'host'])
      .maybeSingle()
    if (memberError || !member) return response({ error: 'Forbidden' }, 403)

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return response({ error: 'AI service is not configured' }, 503)

    const duration = webinar.duration_minutes
      ? `${Math.max(1, Math.min(Number(webinar.duration_minutes), 1_440))} minutes`
      : 'the webinar duration'
    const title = String(webinar.title ?? '').slice(0, 300)
    const description = String(webinar.description ?? 'Not provided').slice(
      0,
      4_000,
    )
    const presenter = String(webinar.presenter_name ?? 'the host').slice(0, 200)
    const prompt = `Create ${safeCount} realistic chat messages for an automated webinar.\n\nTitle: ${title}\nDescription: ${description}\nPresenter: ${presenter}\nDuration: ${duration}\n\nWrite natural, varied attendee reactions, short questions, acknowledgements and occasional helpful host replies. Spread messages throughout the session. Do not make medical, financial, or performance guarantees. Do not use fake urgency, fabricated attendance numbers, or repetitive sales copy. Return ONLY a JSON object with a "scripts" array. Each item must have this shape: {"trigger_seconds": number, "display_name": string, "sender_role": "attendee" | "host", "message": string}.`

    let completion: Response
    try {
      completion = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('APP_URL') ?? 'https://newwebinars.com',
          'X-Title': 'NewWebinars',
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.8,
          max_tokens: 3_000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You write authentic webinar chat scripts. Follow the requested JSON schema exactly.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError')
        return response({ error: 'AI request timed out' }, 504)
      console.error('OpenRouter request error', error)
      return response({ error: 'AI service is temporarily unavailable' }, 502)
    }

    if (!completion.ok) {
      console.error(
        'OpenRouter error',
        completion.status,
        await completion.text(),
      )
      return response({ error: 'AI generation failed' }, 502)
    }

    const result = await completion.json()
    const content = result.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length > 100_000)
      return response({ error: 'AI returned an invalid response' }, 502)

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return response({ error: 'AI returned invalid structured output' }, 502)
    }
    const record =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {}
    const scripts = asLines(
      Array.isArray(parsed) ? parsed : (record.scripts ?? record.messages),
    ).slice(0, safeCount)
    if (!scripts.length)
      return response({ error: 'AI returned no usable chat messages' }, 502)

    const tokensUsed = Number.isFinite(result.usage?.total_tokens)
      ? Number(result.usage.total_tokens)
      : null
    const actualModel =
      typeof result.model === 'string' && result.model ? result.model : MODEL
    if (tokensUsed && tokensUsed > 0) {
      const { error: creditError } = await admin.rpc('consume_account_credit', {
        p_account_id: webinar.account_id,
        p_credit_type: 'ai_token',
        p_quantity: tokensUsed,
        p_scope: 'ai',
        p_scope_id: webinar.id,
        p_metadata: {
          operation: 'generate_chat_script',
          requested_model: MODEL,
          model: actualModel,
          generated_count: scripts.length,
        },
      })
      if (creditError) {
        const exhausted = creditError.message.includes('CREDIT_LIMIT_EXCEEDED')
        return response(
          {
            error: exhausted
              ? 'AI token limit reached for this billing period'
              : 'Unable to record AI usage',
          },
          exhausted ? 429 : 500,
        )
      }
    }

    return response({
      scripts,
      tokens_used: tokensUsed,
      model: actualModel,
      requested_model: MODEL,
    })
  } catch (error) {
    console.error('generate-chat-script unexpected error', error)
    return response({ error: 'Unable to generate chat script' }, 500)
  }
})
