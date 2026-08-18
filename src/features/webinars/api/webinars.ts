import { supabase } from '@/lib/supabase'
import type {
  Webinar,
  WebinarSchedule,
  WebinarScheduleType,
  WebinarSession,
} from '@/shared/database.types'

export type CreateWebinarInput = {
  account_id: string
  title: string
  slug: string
  type: 'live' | 'automated'
  description?: string | null
  scheduled_at?: string | null
  duration_minutes?: number | null
  max_participants?: number | null
  access_mode: 'public' | 'password_protected' | 'paid_access' | 'invited_only'
  price_cents?: number | null
  waiting_room_enabled?: boolean
  early_entry_minutes?: number
  status?: Webinar['status']
  chat_script_offset_seconds?: number
}

export async function fetchWebinars(accountId: string) {
  console.log('[fetchWebinars] accountId', accountId)

  const { data, error } = await supabase
    .from('webinars')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  console.log('[fetchWebinars] result', { data, error: error?.message })

  if (error) throw error
  return (data ?? []) as Webinar[]
}

export async function fetchWebinar(id: string) {
  const { data, error } = await supabase
    .from('webinars')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Webinar
}

export async function fetchWebinarSchedules(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_schedules')
    .select('*')
    .eq('webinar_id', webinarId)
    .order('starts_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WebinarSchedule[]
}

export type CreateWebinarScheduleInput = {
  webinar_id: string
  schedule_type: WebinarScheduleType
  starts_at?: string | null
  ends_at?: string | null
  recurrence_rule?: string | null
  timezone?: string
  is_active?: boolean
}

export async function fetchWebinarSessions(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_sessions')
    .select('*')
    .eq('webinar_id', webinarId)
    .order('starts_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WebinarSession[]
}

export async function createWebinarSchedule(input: CreateWebinarScheduleInput) {
  const { data, error } = await supabase
    .from('webinar_schedules')
    .insert(input)
    .select()
    .single()

  if (error) throw error
  return data as WebinarSchedule
}

export async function deleteWebinarSchedule(id: string) {
  const { error } = await supabase
    .from('webinar_schedules')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function createWebinarSession(input: {
  webinar_id: string
  starts_at: string
  ends_at: string | null
  title?: string | null
  capacity?: number | null
}) {
  const { data, error } = await supabase
    .from('webinar_sessions')
    .insert({ ...input, is_default: false })
    .select()
    .single()

  if (error) throw error
  return data as WebinarSession
}

export async function createWebinar(input: CreateWebinarInput) {
  console.log('[createWebinar] input', input)

  const { data, error } = await supabase
    .from('webinars')
    .insert(input)
    .select()
    .single()

  console.log('[createWebinar] result', { data, error: error?.message })

  if (error) throw error
  return data as Webinar
}

export async function updateWebinar(
  id: string,
  patch: Partial<CreateWebinarInput>,
) {
  const { data, error } = await supabase
    .from('webinars')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Webinar
}

export async function publishWebinar(id: string) {
  return updateWebinar(id, { status: 'published' })
}

export async function deleteWebinar(id: string) {
  const { error } = await supabase.from('webinars').delete().eq('id', id)
  if (error) throw error
}
