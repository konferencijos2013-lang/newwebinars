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
      .select('id, account_id, title, cf_live_input_uid')
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

    if (webinar.cf_live_input_uid) {
      return new Response(
        JSON.stringify({ error: 'Live input already exists for this webinar' }),
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

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meta: { name: webinar.title },
          recording: { mode: 'automatic' },
        }),
      },
    )

    const cfBody = await cfResponse.json()
    if (!cfResponse.ok || !cfBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Cloudflare live input creation failed',
          details: cfBody.errors,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const result = cfBody.result

    await supabaseAdmin
      .from('webinars')
      .update({
        cf_live_input_uid: result.uid,
        cf_playback_hls_url: result.playback?.hls ?? null,
        cf_playback_dash_url: result.playback?.dash ?? null,
        cf_stream_status: 'idle',
      })
      .eq('id', webinar_id)

    await supabaseAdmin.from('webinar_live_sessions').insert({
      webinar_id,
      cf_live_input_uid: result.uid,
      status: 'pending',
    })

    return new Response(
      JSON.stringify({
        live_input_uid: result.uid,
        rtmps_url: result.rtmps?.url,
        stream_key: result.rtmps?.streamKey,
        playback_hls_url: result.playback?.hls,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
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
