import { supabase } from '@/lib/supabase'
import type { Recording, AccountStorageUsage } from '@/shared/database.types'

export type CreateRecordingInput = {
  account_id: string
  webinar_id?: string | null
  session_id?: string | null
  title: string
  description?: string | null
  storage_path: string
  size_bytes?: number
  duration_seconds?: number | null
  recorded_at?: string | null
}

export async function fetchRecordings(accountId: string) {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Recording[]
}

export async function fetchRecording(id: string) {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Recording
}

export async function createRecording(input: CreateRecordingInput) {
  const { data, error } = await supabase
    .from('recordings')
    .insert(input)
    .select()
    .single()

  if (error) throw error
  return data as Recording
}

export async function updateRecording(
  id: string,
  patch: Partial<CreateRecordingInput>,
) {
  const { data, error } = await supabase
    .from('recordings')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Recording
}

export async function deleteRecording(id: string) {
  const { error } = await supabase.from('recordings').delete().eq('id', id)
  if (error) throw error
}

export async function archiveRecording(id: string) {
  const { data, error } = await supabase
    .from('recordings')
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Recording
}

export async function fetchStorageUsage(accountId: string) {
  const { data, error } = await supabase
    .from('account_storage_usage')
    .select('*')
    .eq('account_id', accountId)
    .single()

  if (error) throw error
  return data as AccountStorageUsage
}
