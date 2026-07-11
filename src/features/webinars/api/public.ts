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

export async function registerForWebinar(input: {
  webinar_id: string
  email: string
  full_name?: string | null
  phone?: string | null
  company?: string | null
  referrer_url?: string | null
  referral_code?: string | null
}) {
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      ...input,
      status: 'registered',
      full_name: input.full_name ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      referrer_url: input.referrer_url ?? null,
      referral_code: input.referral_code ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Registration
}

export async function fetchRegistrationByToken(accessToken: string) {
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('access_token', accessToken)
    .single()

  if (error) throw error
  return data as Registration
}

export async function markEnteredWaitingRoom(accessToken: string) {
  const { data, error } = await supabase
    .from('registrations')
    .update({
      entered_waiting_room_at: new Date().toISOString(),
      entered_at: new Date().toISOString(),
    })
    .eq('access_token', accessToken)
    .select()
    .single()

  if (error) throw error
  return data as Registration
}

export async function markJoinedWebinar(accessToken: string) {
  const { data, error } = await supabase
    .from('registrations')
    .update({
      joined_webinar_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
    })
    .eq('access_token', accessToken)
    .select()
    .single()

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
