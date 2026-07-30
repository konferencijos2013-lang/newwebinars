import { supabase } from '@/lib/supabase'
import type {
  ChatScriptSource,
  WebinarChatScript,
} from '@/shared/database.types'

export type ChatScriptInput = {
  webinar_id: string
  trigger_seconds: number
  display_name: string
  sender_role: 'attendee' | 'host'
  message: string
  sort_order?: number
  is_active?: boolean
  source?: ChatScriptSource
}

// Unlike the public-facing fetchChatScripts (active-only, ordered for
// playback), this pulls every row including inactive ones so the editor can
// let hosts toggle visibility without losing drafts.
export async function fetchChatScriptsForEditor(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_chat_scripts')
    .select('*')
    .eq('webinar_id', webinarId)
    .order('trigger_seconds', { ascending: true })

  if (error) throw error
  return (data ?? []) as WebinarChatScript[]
}

export async function createChatScript(input: ChatScriptInput) {
  const { data, error } = await supabase
    .from('webinar_chat_scripts')
    .insert({ ...input, source: input.source ?? 'manual' })
    .select()
    .single()

  if (error) throw error
  return data as WebinarChatScript
}

export async function updateChatScript(
  id: string,
  patch: Partial<ChatScriptInput>,
) {
  const { data, error } = await supabase
    .from('webinar_chat_scripts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as WebinarChatScript
}

export async function deleteChatScript(id: string) {
  const { error } = await supabase
    .from('webinar_chat_scripts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function bulkInsertChatScripts(
  rows: ChatScriptInput[],
): Promise<WebinarChatScript[]> {
  if (rows.length === 0) return []
  const { data, error } = await supabase
    .from('webinar_chat_scripts')
    .insert(rows.map((r) => ({ ...r, source: r.source ?? 'manual' })))
    .select()

  if (error) throw error
  return (data ?? []) as WebinarChatScript[]
}

// Finds the most recent finished live session for this webinar so we know
// when "elapsed 0" was, then converts the real chat transcript from that
// session into replayable script lines (trigger_seconds = seconds after the
// stream started). Attendee messages keep their original display name;
// deleted (moderated) messages are excluded since chat_messages RLS/select
// already filters deleted_at is null server-side, but we double-check here
// too in case a service-role caller ever reuses this function.
export async function importLastLiveSessionAsScript(webinarId: string) {
  const { data: session, error: sessionError } = await supabase
    .from('webinar_live_sessions')
    .select('id, cf_live_input_uid, started_at, ended_at')
    .eq('webinar_id', webinarId)
    .eq('status', 'ended')
    .not('started_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionError) throw sessionError
  if (!session?.started_at) {
    throw new Error('No finished live session found to import from')
  }

  const startedAt = new Date(session.started_at).getTime()

  let messagesQuery = supabase
    .from('chat_messages')
    .select('*')
    .eq('webinar_id', webinarId)
    .is('deleted_at', null)
    .gte('sent_at', session.started_at)
    .order('sent_at', { ascending: true })

  if (session.ended_at) {
    messagesQuery = messagesQuery.lte('sent_at', session.ended_at)
  }

  const { data: messages, error: messagesError } = await messagesQuery

  if (messagesError) throw messagesError
  if (!messages || messages.length === 0) {
    throw new Error('No chat messages found for this webinar')
  }

  const rows: ChatScriptInput[] = messages
    .filter((m) => m.message_type === 'chat')
    .map((m, idx) => {
      const sentAt = new Date(m.sent_at).getTime()
      const triggerSeconds = Math.max(
        0,
        Math.round((sentAt - startedAt) / 1000),
      )
      return {
        webinar_id: webinarId,
        trigger_seconds: triggerSeconds,
        display_name: m.sender_name,
        sender_role:
          m.sender_name.toLowerCase() === 'host' ? 'host' : 'attendee',
        message: m.message,
        sort_order: idx,
        is_active: true,
        source: 'imported' as ChatScriptSource,
      }
    })

  return bulkInsertChatScripts(rows)
}
