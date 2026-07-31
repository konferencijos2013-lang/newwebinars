import { supabase } from '@/lib/supabase'
import type {
  Webinar,
  Registration,
  ChatMessage,
  WebinarChatScript,
} from '@/shared/database.types'

export async function fetchPublishedWebinarBySlug(slug: string) {
  const { data, error } = await supabase
    .from('published_webinar_sessions')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) throw error
  return data as Webinar
}

export async function fetchWebinarBySlug(slug: string) {
  const { data, error } = await supabase
    .from('webinars')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error) throw error
  return data as Webinar
}

// A public branded hostname belongs to a single account. Resolve the slug
// through the database rather than allowing a slug from another tenant.
export async function fetchWebinarByHostname(hostname: string, slug: string) {
  const { data, error } = await supabase
    .rpc('get_published_webinar_by_hostname', {
      p_hostname: hostname.toLowerCase(),
      p_slug: slug,
    })
    .single()

  if (error) throw error
  return data as Webinar
}

// Goes through a SECURITY DEFINER RPC instead of a direct insert: anon only
// ever had INSERT (not SELECT) granted on registrations, so the old
// `.insert().select().single()` call failed with "permission denied for
// table registrations" (42501) — Postgres needs SELECT to return the
// RETURNING row. The RPC re-checks the same open-for-registration/partner-code
// rules the previous INSERT policy enforced and returns only the row it just
// created, so it's safe for anon without a blanket table grant.
export async function registerForWebinar(input: {
  webinar_id: string
  email: string
  full_name?: string | null
  phone?: string | null
  company?: string | null
  referrer_url?: string | null
  referral_code?: string | null
}) {
  const { data, error } = await supabase.rpc('register_for_webinar', {
    p_webinar_id: input.webinar_id,
    p_email: input.email,
    p_full_name: input.full_name ?? null,
    p_phone: input.phone ?? null,
    p_company: input.company ?? null,
    p_referrer_url: input.referrer_url ?? null,
    p_referral_code: input.referral_code ?? null,
  })

  if (error) throw error
  return data as Registration
}

// These go through SECURITY DEFINER RPCs instead of direct table access:
// access_token is an unguessable bearer-style secret, so a blanket anon
// SELECT/UPDATE grant on registrations would let anyone dump or mutate
// every attendee's row. The RPC only ever touches the single row whose
// access_token matches, regardless of what the caller can otherwise see.
export async function fetchRegistrationByToken(accessToken: string) {
  const { data, error } = await supabase.rpc('get_registration_by_token', {
    p_access_token: accessToken,
  })

  if (error) throw error
  if (!data) throw new Error('Registration not found')
  return data as Registration
}

export async function markEnteredWaitingRoom(accessToken: string) {
  const { data, error } = await supabase.rpc(
    'mark_registration_entered_waiting_room',
    { p_access_token: accessToken },
  )

  if (error) throw error
  return data as Registration
}

export async function markJoinedWebinar(accessToken: string) {
  const { data, error } = await supabase.rpc(
    'mark_registration_joined_webinar',
    {
      p_access_token: accessToken,
    },
  )

  if (error) throw error
  return data as Registration
}

export async function fetchChatMessages(webinarId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('webinar_id', webinarId)
    .order('sent_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

export async function sendChatMessage(input: {
  webinar_id: string
  registration_id?: string | null
  sender_name: string
  message: string
}) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      ...input,
      message_type: 'chat',
      sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data as ChatMessage
}

export async function fetchChatScripts(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_chat_scripts')
    .select('*')
    .eq('webinar_id', webinarId)
    .eq('is_active', true)
    .order('trigger_seconds', { ascending: true })

  if (error) throw error
  return (data ?? []) as WebinarChatScript[]
}

export async function deleteChatMessage(messageId: string) {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId)

  if (error) throw error
}
