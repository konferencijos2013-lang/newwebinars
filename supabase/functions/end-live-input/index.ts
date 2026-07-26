import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { webinar_id } = await req.json()
    if (!webinar_id) {
      return new Response(JSON.stringify({ error: 'Missing webinar_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: webinar, error: webinarError } = await supabaseAdmin
      .from('webinars')
      .select('id, account_id, cf_live_input_uid, cf_stream_status')
      .eq('id', webinar_id)
      .single()

    if (webinarError || !webinar) {
      return new Response(JSON.stringify({ error: 'Webinar not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: membership } = await supabaseAdmin
      .from('account_members')
      .select('role')
      .eq('account_id', webinar.account_id)
      .eq('user_id', userData.user.id)
      .in('role', ['owner', 'admin', 'editor', 'host'])
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!webinar.cf_live_input_uid) {
      return new Response(
        JSON.stringify({ error: 'No live input for this webinar' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')
    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'Cloudflare not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${webinar.cf_live_input_uid}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    )

    const { data: activeSession } = await supabaseAdmin
      .from('webinar_live_sessions')
      .select('id, started_at')
      .eq('webinar_id', webinar_id)
      .eq('cf_live_input_uid', webinar.cf_live_input_uid)
      .in('status', ['pending', 'live'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const now = new Date().toISOString()
    if (activeSession) {
      const startedAt = activeSession.started_at
        ? new Date(activeSession.started_at)
        : new Date()
      const durationSeconds = Math.max(
        0,
        Math.floor((new Date(now).getTime() - startedAt.getTime()) / 1000),
      )

      await supabaseAdmin
        .from('webinar_live_sessions')
        .update({
          status: 'ended',
          ended_at: now,
          duration_seconds: durationSeconds,
        })
        .eq('id', activeSession.id)

      await supabaseAdmin.rpc('emit_live_session_usage', {
        p_session_id: activeSession.id,
      })
    }

    await supabaseAdmin
      .from('webinars')
      .update({
        cf_stream_status: 'ended',
        cf_live_input_uid: null,
        cf_playback_hls_url: null,
        cf_playback_dash_url: null,
      })
      .eq('id', webinar_id)

    await supabaseAdmin.channel(`webinar:${webinar_id}`).send({
      type: 'broadcast',
      event: 'stream_status',
      payload: { status: 'ended' },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  }
})
