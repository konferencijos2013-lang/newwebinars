import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Cloudflare's live_input events (connected/disconnected/errored) are only
// delivered through the account-level Notifications/Alerting API, which is a
// separate one-time setup from the simple /stream/webhook endpoint and needs
// its own API token permission. Rather than depend on that being configured,
// the host and viewer pages poll this function, which asks Cloudflare
// directly for the live input's current connection state and keeps the
// webinar row in sync. It only ever reads/derives non-sensitive status +
// playback info, so it's safe to call without a user session.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const webinarId = url.searchParams.get('webinar_id')
    if (!webinarId) {
      return new Response(JSON.stringify({ error: 'Missing webinar_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: webinar, error: webinarError } = await supabaseAdmin
      .from('webinars')
      .select(
        'id, cf_live_input_uid, cf_stream_status, cf_playback_hls_url, cf_playback_dash_url',
      )
      .eq('id', webinarId)
      .single()

    if (webinarError || !webinar) {
      return new Response(JSON.stringify({ error: 'Webinar not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!webinar.cf_live_input_uid) {
      return new Response(
        JSON.stringify({ cf_stream_status: 'idle', cf_playback_hls_url: null }),
        {
          status: 200,
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
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${webinar.cf_live_input_uid}`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    const cfBody = await cfResponse.json()

    if (!cfResponse.ok || !cfBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch live input status',
          details: cfBody.errors,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const result = cfBody.result
    const cfState = result.status?.current?.state as string | undefined

    let nextStatus = webinar.cf_stream_status
    if (cfState === 'connected' || cfState === 'reconnected') {
      nextStatus = 'live'
    } else if (
      cfState === 'disconnected' ||
      cfState === 'error' ||
      cfState === 'ready'
    ) {
      // The encoder is definitely not streaming. Only transition out of live
      // to a terminal state; never wipe 'created'/'idle' just from a ready/disconnected
      // check while the host is still setting things up.
      if (webinar.cf_stream_status === 'live') {
        nextStatus = 'ended'
      }
    }

    // Prefer the playback urls already stored; fall back to deriving them.
    const customerSubdomain = (
      result.webRTCPlayback?.url ??
      result.webRTC?.url ??
      ''
    ).match(/https:\/\/(customer-[a-z0-9]+)\.cloudflarestream\.com/)?.[1]
    const playbackHlsUrl =
      webinar.cf_playback_hls_url ??
      (customerSubdomain
        ? `https://${customerSubdomain}.cloudflarestream.com/${result.uid}/manifest/video.m3u8`
        : null)
    const playbackDashUrl =
      webinar.cf_playback_dash_url ??
      (customerSubdomain
        ? `https://${customerSubdomain}.cloudflarestream.com/${result.uid}/manifest/video.mpd`
        : null)

    // Always sync the database/notify clients when the status changes.
    if (
      nextStatus !== webinar.cf_stream_status ||
      playbackHlsUrl !== webinar.cf_playback_hls_url ||
      playbackDashUrl !== webinar.cf_playback_dash_url
    ) {
      await supabaseAdmin
        .from('webinars')
        .update({
          cf_stream_status: nextStatus,
          cf_playback_hls_url: playbackHlsUrl,
          cf_playback_dash_url: playbackDashUrl,
        })
        .eq('id', webinarId)

      await supabaseAdmin.channel(`webinar:${webinarId}`).send({
        type: 'broadcast',
        event: 'stream_status',
        payload: { status: nextStatus },
      })
    }

    return new Response(
      JSON.stringify({
        cf_stream_status: nextStatus,
        cf_playback_hls_url: playbackHlsUrl,
        cf_playback_dash_url: playbackDashUrl,
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
