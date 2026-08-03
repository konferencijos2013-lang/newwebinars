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

    const authorization = req.headers.get('Authorization')
    if (!authorization || !thread_id || !account_id) {
      return new Response(
        JSON.stringify({
          error: 'Authentication, thread_id, and account_id are required',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    )
    const { data: auth, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !auth.user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('ai_threads')
      .select('id')
      .eq('id', thread_id)
      .eq('account_id', account_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (threadError || !thread) {
      return new Response(
        JSON.stringify({
          error: 'AI thread is not available for this account',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Use specialized defaults for the dashboard's slide and storytelling modes.
    // Account-level active prompts still override these defaults below.
    let systemContent =
      'You are a helpful webinar and funnel assistant for NewWebinars. Be concise and actionable.'

    if (scope === 'slides') {
      systemContent = `You are a world-class direct-response copywriter and webinar expert specializing in Jason Fladlien's Genius Webinars methodology. Create high-converting webinar slide text from the user's product details.

Follow these 14 steps exactly, grouping slides into the four parts below:
1. Hook: cut through noise and increase desire.
2. Pain: address limiting beliefs and excuses; wake them from the nightmare.
3. Tease: create open loops about what they will discover.
4. Excite: paint the pot of gold at the end of the rainbow.
5. Position: establish authority through results, positioning, celebrity, or testimonials.
6. Paradigm: create a this-changes-everything moment with an analogy.
7. Mechanisms: teach 3–5 key steps. For every step create Context (why it matters), Vision (a vivid slice of life using the solution), and Strategy (specific how-to criteria or actions).
8. Commitment: add micro-commitment / Yes Momentum slides after each step.
9. Transition: create a 60-second recap, six agreement questions, and a two-choices close (do it alone vs. do it together).
10. Offer: product name, tagline, and high-level components, designed for under five minutes.
11. Price: use price anchoring from high to the stated price and introduce the first URL/CTA.
12. Bonuses: devote 2–3 times more attention than the core offer; each bonus must defeat an objection or demonstrate dramatic value.
13. Guarantee: reverse the risk, stating the supplied unconditional or conditional guarantee accurately.
14. Scarcity and objections: ethically use real scarcity only; address money, time, and trust objections.

Return a structured deck. For every slide provide: slide number, step, concise headline, body copy, and optional speaker note. One main idea per slide. Use show-don't-just-tell writing and natural tie-downs such as “Makes sense?” or “Right?” throughout. Do not invent testimonials, guarantees, prices, bonuses, results, or scarcity; flag any missing commercial detail as a placeholder.`
    } else if (scope === 'storytelling') {
      systemContent = `You are a professional Story Selling Expert and master copywriter. Turn raw Story Vault experiences into high-converting narratives using Jim Edwards' 7C Story Formula.

Use this framework in order: Characters (relatable figures), Context (what, where, when, and how), Conflict (a meaningful dilemma), Climax (high-stakes sensory word pictures), Closure (the resolution and aftermath), Conclusions (a resonant lesson), and Call to Action (a natural bridge from the moral to a specific offer action).

First critically assess the user's Story Vault details. If the conflict is weak, the climax lacks emotional or sensory specificity, or a required element is missing, do not draft the final story. Instead, ask a short, numbered set of precise clarification questions. Once sufficient detail is available, write a vivid, emotionally engaging story that makes the reader thirsty for the offer, then create a seamless, ethical CTA. Never invent personal facts, outcomes, or testimonials. Preserve the user's voice and use clear section headings for the 7Cs.`
    }

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

    if (tokensUsed && tokensUsed > 0) {
      const { error: creditError } = await supabaseAdmin.rpc(
        'consume_account_credit',
        {
          p_account_id: account_id,
          p_credit_type: 'ai_token',
          p_quantity: tokensUsed,
          p_scope: 'ai',
          p_scope_id: null,
          p_metadata: { thread_id, model: 'gpt-4o-mini' },
        },
      )
      if (creditError) {
        const exhausted = creditError.message.includes('CREDIT_LIMIT_EXCEEDED')
        return new Response(
          JSON.stringify({
            error: exhausted
              ? 'AI token limit reached for this billing period'
              : 'Unable to record AI usage',
          }),
          {
            status: exhausted ? 429 : 500,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    // Persist assistant message after its usage has been accounted for.
    if (content) {
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
