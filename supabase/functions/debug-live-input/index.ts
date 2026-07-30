import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const uid = url.searchParams.get('uid')
    const mode = url.searchParams.get('mode') ?? 'live_input'

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')
    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'Cloudflare not configured' }),
        { status: 500 },
      )
    }

    if (mode === 'update') {
      if (!uid)
        return new Response(JSON.stringify({ error: 'Missing uid' }), {
          status: 400,
        })
      const cfResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${uid}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recording: { mode: 'automatic' },
            preferLowLatency: true,
            timeoutSeconds: 0,
          }),
        },
      )
      const cfBody = await cfResponse.json()
      return new Response(
        JSON.stringify({ status: cfResponse.status, body: cfBody }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    if (!uid)
      return new Response(JSON.stringify({ error: 'Missing uid' }), {
        status: 400,
      })
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${uid}`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    const cfBody = await cfResponse.json()
    return new Response(
      JSON.stringify({ status: cfResponse.status, body: cfBody }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500 },
    )
  }
})
