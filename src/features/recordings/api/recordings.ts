import { supabase } from '@/lib/supabase'
import type {
  Recording,
  RecordingStatus,
  AccountStorageUsage,
} from '@/shared/database.types'
import {
  RecordingUploadError,
  readVideoDurationSeconds,
  recordingStoragePath,
  validateRecordingFile,
} from '@/features/recordings/recordingFile'

export type CreateRecordingInput = {
  id?: string
  account_id: string
  webinar_id?: string | null
  session_id?: string | null
  title: string
  description?: string | null
  storage_path: string
  size_bytes?: number
  duration_seconds?: number | null
  recorded_at?: string | null
  status?: RecordingStatus
  metadata?: Record<string, unknown> | null
}

export type UploadRecordingInput = {
  accountId: string
  file: File
  title: string
  description?: string | null
  webinarId?: string | null
}

export async function fetchRecordings(accountId: string) {
  const { data, error } = await supabase
    .from('recordings')
    .select('*')
    .eq('account_id', accountId)
    .neq('status', 'deleted')
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
    .insert({
      ...input,
      status: input.status ?? 'ready',
      processed_at: new Date().toISOString(),
    })
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
  const recording = await fetchRecording(id)
  if (recording.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('recordings')
      .remove([recording.storage_path])
    if (storageError && !/not found/i.test(storageError.message)) {
      throw storageError
    }
  }

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

export async function ensureStorageUsage(accountId: string) {
  const { error } = await supabase.rpc('refresh_account_storage_usage', {
    p_account_id: accountId,
  })
  if (error) throw error
  return fetchStorageUsage(accountId)
}

export async function uploadRecording(input: UploadRecordingInput) {
  const title = input.title.trim()
  if (!title) throw new RecordingUploadError('missing_title')

  const usage = await ensureStorageUsage(input.accountId)
  const fileChoice = validateRecordingFile(
    input.file,
    Math.max(0, usage.quota_bytes - usage.total_bytes),
  )
  const durationSeconds = await readVideoDurationSeconds(input.file)
  const recordingId = crypto.randomUUID()
  const storagePath = recordingStoragePath(
    input.accountId,
    recordingId,
    fileChoice.extension,
  )

  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(storagePath, input.file, {
      contentType: fileChoice.contentType,
      upsert: false,
    })
  if (uploadError) throw uploadError

  try {
    return await createRecording({
      id: recordingId,
      account_id: input.accountId,
      webinar_id: input.webinarId || null,
      title,
      description: input.description?.trim() || null,
      storage_path: storagePath,
      size_bytes: input.file.size,
      duration_seconds: durationSeconds,
      recorded_at: new Date().toISOString(),
      status: 'ready',
      metadata: { source: 'upload' },
    })
  } catch (error) {
    await supabase.storage.from('recordings').remove([storagePath])
    throw error
  }
}

export async function getRecordingPlaybackUrl(
  recording: Pick<Recording, 'storage_path' | 'recording_url'>,
) {
  if (
    recording.recording_url &&
    /^https?:\/\//i.test(recording.recording_url)
  ) {
    return recording.recording_url
  }

  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(recording.storage_path, 60 * 60)
  if (error || !data?.signedUrl) {
    throw error ?? new Error('playback_failed')
  }
  return data.signedUrl
}
