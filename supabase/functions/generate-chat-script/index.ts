import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type GeneratedLine = {
  trigger_seconds: number
  display_name: string
  sender_role: 'attendee' | 'host'
  message: string
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

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) throw new Error('Unauthorized')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) throw new Error('Unauthorized')

    const { webinar_id, count = 16 } = await req.json()
    if (!webinar_id || typeof webinar_id !== 'string')
      throw new Error('Missing webinar_id')

    const { data: webinar, error: webinarError } = await admin
      .from('webinars')
      .select(
        'id, account_id, title, description, duration_minutes, presenter_name',
      )
      .eq('id', webinar_id)
      .single()
    if (webinarError || !webinar) throw new Error('Webinar not found')

    const { data: member } = await admin
      .from('account_members')
      .select('role')
      .eq('account_id', webinar.account_id)
      .eq('user_id', userData.user.id)
      .in('role', ['owner', 'admin', 'editor', 'host'])
      .maybeSingle()
    if (!member) throw new Error('Forbidden')

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OpenAI API key not configured')

    const safeCount = Math.max(4, Math.min(Number(count) || 16, 40))
    const duration = webinar.duration_minutes
      ? `${webinar.duration_minutes} minutes`
      : 'the webinar duration'
    const prompt = `Create ${safeCount} realistic chat messages for an automated webinar.\n\nTitle: ${webinar.title}\nDescription: ${webinar.description ?? 'Not provided'}\nPresenter: ${webinar.presenter_name ?? 'the host'}\nDuration: ${duration}\n\nWrite natural, varied attendee reactions, short questions, acknowledgements and occasional helpful host replies. Spread messages throughout the session. Do not make medical, financial, or performance guarantees. Do not use fake urgency, fabricated attendance numbers, or repetitive sales copy. Return ONLY a JSON array with objects in this exact shape: {"trigger_seconds": number, "display_name": string, "sender_role": "attendee" | "host", "message": string}.`

    const completion = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.8,
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
      },
    )
    if (!completion.ok) throw new Error('AI generation request failed')

    const response = await completion.json()
    const content = response.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content)
    const scripts = asLines(
      Array.isArray(parsed) ? parsed : (parsed.scripts ?? parsed.messages),
    )
    if (!scripts.length) throw new Error('AI returned no usable chat messages')

    return new Response(JSON.stringify({ scripts }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status =
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
