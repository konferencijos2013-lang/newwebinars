import { supabase } from '@/lib/supabase'

export interface ReminderRule {
  id: string
  webinar_id: string
  integration_connection_id: string | null
  channel: 'email' | 'telegram'
  minutes_before: number
  subject: string | null
  body: string | null
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export async function fetchReminderRules(webinarId: string) {
  const { data, error } = await supabase
    .from('reminder_rules')
    .select(
      'id,webinar_id,integration_connection_id,channel,minutes_before,subject,body,is_enabled,created_at,updated_at',
    )
    .eq('webinar_id', webinarId)
    .order('minutes_before', { ascending: false })
  if (error) throw error
  return (data ?? []) as ReminderRule[]
}

export async function createReminderRule(input: {
  webinarId: string
  integrationConnectionId: string
  minutesBefore: number
  subject: string
  body: string
}) {
  const { data, error } = await supabase
    .from('reminder_rules')
    .insert({
      webinar_id: input.webinarId,
      integration_connection_id: input.integrationConnectionId,
      channel: 'email',
      minutes_before: input.minutesBefore,
      subject: input.subject.trim() || null,
      body: input.body.trim() || null,
      is_enabled: true,
    })
    .select(
      'id,webinar_id,integration_connection_id,channel,minutes_before,subject,body,is_enabled,created_at,updated_at',
    )
    .single()
  if (error) throw error
  return data as ReminderRule
}

export async function updateReminderRule(
  id: string,
  patch: Partial<
    Pick<
      ReminderRule,
      | 'integration_connection_id'
      | 'minutes_before'
      | 'subject'
      | 'body'
      | 'is_enabled'
    >
  >,
) {
  const { data, error } = await supabase
    .from('reminder_rules')
    .update(patch)
    .eq('id', id)
    .select(
      'id,webinar_id,integration_connection_id,channel,minutes_before,subject,body,is_enabled,created_at,updated_at',
    )
    .single()
  if (error) throw error
  return data as ReminderRule
}

export async function deleteReminderRule(id: string) {
  const { error } = await supabase.from('reminder_rules').delete().eq('id', id)
  if (error) throw error
}
