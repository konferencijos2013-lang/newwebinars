import { supabase } from '@/lib/supabase'

export interface ReminderRule {
  id: string
  webinar_id: string
  integration_connection_id: string | null
  channel: 'email' | 'telegram' | 'manychat'
  timing: 'before_start' | 'after_start' | 'after_end'
  minutes_before: number
  audience: 'all' | 'attended' | 'missed'
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
      'id,webinar_id,integration_connection_id,channel,timing,minutes_before,audience,subject,body,is_enabled,created_at,updated_at',
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
  timing?: 'before_start' | 'after_start' | 'after_end'
  audience?: 'all' | 'attended' | 'missed'
  subject: string
  body: string
  channel?: 'email' | 'manychat' | 'telegram'
}) {
  const { data, error } = await supabase
    .from('reminder_rules')
    .insert({
      webinar_id: input.webinarId,
      integration_connection_id: input.integrationConnectionId,
      channel: input.channel ?? 'email',
      timing: input.timing ?? 'before_start',
      audience: input.audience ?? 'all',
      minutes_before: input.minutesBefore,
      subject: input.subject.trim() || null,
      body: input.body.trim() || null,
      is_enabled: true,
    })
    .select(
      'id,webinar_id,integration_connection_id,channel,timing,minutes_before,audience,subject,body,is_enabled,created_at,updated_at',
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
        | 'timing'
        | 'audience'
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
      'id,webinar_id,integration_connection_id,channel,timing,minutes_before,audience,subject,body,is_enabled,created_at,updated_at',
    )
    .single()
  if (error) throw error
  return data as ReminderRule
}

export async function deleteReminderRule(id: string) {
  const { error } = await supabase.from('reminder_rules').delete().eq('id', id)
  if (error) throw error
}

export type StandardReminder = {
  timing: ReminderRule['timing']
  minutes: number
  audience: ReminderRule['audience']
  subject: string
  body: string
  shortBody: string
}

export const STANDARD_REMINDERS: StandardReminder[] = [
  {
    timing: 'before_start',
    minutes: 1440,
    audience: 'all',
    subject: 'Rytoj: {{webinar_title}}',
    body: 'Sveiki, {{name}},\n\nrytoj vyks „{{webinar_title}}“.\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
    shortBody:
      'Sveiki, {{name}}! Rytoj vyks „{{webinar_title}}“. Prisijungti: {{webinar_link}}',
  },
  {
    timing: 'before_start',
    minutes: 60,
    audience: 'all',
    subject: 'Po valandos: {{webinar_title}}',
    body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po valandos.\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
    shortBody:
      'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po valandos. Prisijungti: {{webinar_link}}',
  },
  {
    timing: 'before_start',
    minutes: 15,
    audience: 'all',
    subject: 'Po 15 minučių: {{webinar_title}}',
    body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po 15 minučių.\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
    shortBody:
      'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po 15 minučių. Prisijungti: {{webinar_link}}',
  },
  {
    timing: 'after_start',
    minutes: 5,
    audience: 'all',
    subject: 'Jau prasidėjo: {{webinar_title}}',
    body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ jau prasidėjo. Prisijunkite dabar:\n{{webinar_link}}',
    shortBody:
      'Sveiki, {{name}}! „{{webinar_title}}“ jau prasidėjo. Prisijungti: {{webinar_link}}',
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'attended',
    subject: 'Pasiūlymas po „{{webinar_title}}“',
    body: 'Sveiki, {{name}},\n\načiū, kad dalyvavote „{{webinar_title}}“.\n\nPasiūlymą rasite čia:\n{{offer_link}}',
    shortBody:
      'Sveiki, {{name}}! Ačiū, kad dalyvavote „{{webinar_title}}“. Pasiūlymas: {{offer_link}}',
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'missed',
    subject: '„{{webinar_title}}“ kartosis',
    body: 'Sveiki, {{name}},\n\nšį kartą „{{webinar_title}}“ praleidote. Kitas laikas: {{next_session}}.\n\nRegistracija:\n{{public_webinar_link}}',
    shortBody:
      'Sveiki, {{name}}! „{{webinar_title}}“ šį kartą praleidote. Kitas laikas: {{next_session}}. {{public_webinar_link}}',
  },
]
