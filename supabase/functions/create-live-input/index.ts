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
      return new Response(
        JSON.stringify({
          error: 'Webinar not found',
          debug: webinarError
            ? {
                code: webinarError.code,
                message: webinarError.message,
                details: webinarError.details,
                hint: webinarError.hint,
              }
            : { reason: 'no row returned for webinar_id', webinar_id },
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
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

    const optimalSettings = {
      meta: { name: webinar.title },
      recording: { mode: 'automatic' },
      // Cuts glass-to-glass latency from ~20-30s (standard HLS segment
      // + buffer) down to a few seconds. Playback also needs
      // ?protocol=llhls on the manifest URL (see useHlsVideo).
      preferLowLatency: true,
      // timeoutSeconds: 0 disables Cloudflare's automatic disconnect when
      // the encoder stops sending data for a while (obs restart, network
      // blip, etc). Without this, brief ingest interruptions permanently
      // kill the stream instead of letting the encoder reconnect.
      timeoutSeconds: 0,
    }

    if (webinar.cf_live_input_uid) {
      // Update existing live input with optimal settings instead of failing,
      // so hosts can recover from a bad configuration without manual cleanup.
      const cfUpdate = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${webinar.cf_live_input_uid}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(optimalSettings),
        },
      )
      const updateBody = await cfUpdate.json()
      if (!cfUpdate.ok || !updateBody.success) {
        return new Response(
          JSON.stringify({
            error: 'Failed to update existing live input',
            details: updateBody.errors,
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }

      // Re-extract the customer subdomain after an update; Cloudflare may
      // rotate it, and without playback urls the players will stay blank.
      const updatedSubdomain = (
        updateBody.result?.webRTCPlayback?.url ??
        updateBody.result?.webRTC?.url ??
        ''
      ).match(/https:\/\/(customer-[a-z0-9]+)\.cloudflarestream\.com/)?.[1]
      const updatedHlsUrl = updatedSubdomain
        ? `https://${updatedSubdomain}.cloudflarestream.com/${webinar.cf_live_input_uid}/manifest/video.m3u8`
        : null
      const updatedDashUrl = updatedSubdomain
        ? `https://${updatedSubdomain}.cloudflarestream.com/${webinar.cf_live_input_uid}/manifest/video.mpd`
        : null

      await supabaseAdmin
        .from('webinars')
        .update({
          cf_playback_hls_url: updatedHlsUrl ?? undefined,
          cf_playback_dash_url: updatedDashUrl ?? undefined,
        })
        .eq('id', webinar_id)

      return new Response(
        JSON.stringify({
          live_input_uid: webinar.cf_live_input_uid,
          rtmps_url: updateBody.result?.rtmps?.url,
          stream_key: updateBody.result?.rtmps?.streamKey,
          playback_hls_url: updatedHlsUrl,
        }),
        {
          status: 200,
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
        body: JSON.stringify(optimalSettings),
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

    // The live_inputs API never returns a `playback` field (that only
    // exists on per-broadcast video objects under .../live_inputs/{uid}/videos).
    // Cloudflare's docs recommend building the manifest URL directly from the
    // live input UID instead, which always reflects the active broadcast (or
    // an idle placeholder) without needing a second API call per session.
    const customerSubdomain = (
      result.webRTCPlayback?.url ?? result.webRTC?.url ?? ''
    ).match(/https:\/\/(customer-[a-z0-9]+)\.cloudflarestream\.com/)?.[1]
    const playbackHlsUrl = customerSubdomain
      ? `https://${customerSubdomain}.cloudflarestream.com/${result.uid}/manifest/video.m3u8`
      : null
    const playbackDashUrl = customerSubdomain
      ? `https://${customerSubdomain}.cloudflarestream.com/${result.uid}/manifest/video.mpd`
      : null

    await supabaseAdmin
      .from('webinars')
      .update({
        cf_live_input_uid: result.uid,
        cf_playback_hls_url: playbackHlsUrl,
        cf_playback_dash_url: playbackDashUrl,
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
        playback_hls_url: playbackHlsUrl,
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
