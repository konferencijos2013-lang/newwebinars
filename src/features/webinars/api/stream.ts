import { supabase } from '@/lib/supabase'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CfStreamStatus } from '@/shared/database.types'

export type LiveInputResponse = {
  live_input_uid: string
  rtmps_url: string
  stream_key: string
  playback_hls_url: string
}

async function describeError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      const base = body?.error ?? error.message
      const d = body?.debug
      const debugSuffix = d
        ? ` [${[d.code, d.message ?? d.reason, d.details, d.hint]
            .filter(Boolean)
            .join(' | ')}]`
        : ''
      return new Error(`${base}${debugSuffix}`)
    } catch {
      return new Error(error.message)
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function createLiveInput(webinarId: string) {
  const { data, error } = await supabase.functions.invoke<LiveInputResponse>(
    'create-live-input',
    {
      body: { webinar_id: webinarId },
    },
  )

  if (error) throw await describeError(error)
  if (!data) throw new Error('No response from create-live-input')
  return data
}

export async function endLiveInput(webinarId: string) {
  const { data, error } = await supabase.functions.invoke<{ success: true }>(
    'end-live-input',
    {
      body: { webinar_id: webinarId },
    },
  )

  if (error) throw await describeError(error)
  if (!data) throw new Error('No response from end-live-input')
  return data
}

export function subscribeToStreamStatus(
  webinarId: string,
  onStatus: (status: CfStreamStatus) => void,
): RealtimeChannel {
  const channel = supabase.channel(`webinar:${webinarId}`)

  channel
    .on(
      'broadcast',
      { event: 'stream_status' },
      (payload: { payload?: { status?: CfStreamStatus } }) => {
        const status = payload.payload?.status
        if (status) onStatus(status)
      },
    )
    .subscribe()

  return channel
}
