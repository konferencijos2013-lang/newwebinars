import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  try {
    const { thread_id, messages, scope, account_id } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Build system prompt from scope and stored prompt templates.
    let systemContent =
      'You are a helpful webinar and funnel assistant for NewWebinars. Be concise and actionable.'

    if (scope && account_id) {
      const { data: prompt } = await supabaseAdmin
        .from('ai_prompts')
        .select('system_prompt, user_prompt_template')
        .eq('account_id', account_id)
        .eq('scope', scope)
        .eq('is_active', true)
        .maybeSingle()

      if (prompt?.system_prompt) {
        systemContent = prompt.system_prompt
      }
    }

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
          messages: [{ role: 'system', content: systemContent }, ...messages],
          temperature: 0.7,
        }),
      },
    )

    if (!completion.ok) {
      const body = await completion.text()
      console.error('OpenAI error', body)
      return new Response(JSON.stringify({ error: 'OpenAI request failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const json = await completion.json()
    const content = json.choices?.[0]?.message?.content ?? ''
    const tokensUsed = json.usage?.total_tokens ?? null

    // Persist assistant message when thread_id is provided.
    if (thread_id && content) {
      await supabaseAdmin.from('ai_messages').insert({
        thread_id,
        role: 'assistant',
        content,
        tokens_used: tokensUsed,
      })
    }

    return new Response(JSON.stringify({ content, tokens_used: tokensUsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
