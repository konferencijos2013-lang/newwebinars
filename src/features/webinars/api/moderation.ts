import { supabase } from '@/lib/supabase'

export type ModerationMessage = {
  id: string
  webinar_id: string
  registration_id: string | null
  sender_name: string
  message: string
  message_type: string
  sent_at: string
  deleted_at: string | null
  chat_blocked_at: string | null
  removed_from_webinar_at: string | null
}

export async function canModerateWebinar(webinarId: string) {
  const { data, error } = await supabase.rpc('can_moderate_webinar', {
    p_webinar_id: webinarId,
  })
  if (error) throw error
  return Boolean(data)
}

export async function fetchModerationMessages(webinarId: string) {
  const { data, error } = await supabase.rpc(
    'get_webinar_moderation_messages',
    { p_webinar_id: webinarId },
  )
  if (error) throw error
  return (data ?? []) as ModerationMessage[]
}

export async function moderateRegistration(
  registrationId: string,
  action: 'mute' | 'unmute' | 'remove' | 'restore',
) {
  const { error } = await supabase.rpc('moderate_webinar_registration', {
    p_registration_id: registrationId,
    p_action: action,
  })
  if (error) throw error
}

export async function softDeleteMessage(messageId: string) {
  const { error } = await supabase.rpc('soft_delete_chat_message', {
    p_message_id: messageId,
  })
  if (error) throw error
}
