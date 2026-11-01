export const RECORDING_MAX_BYTES = 2 * 1024 * 1024 * 1024

const EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])
const MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
])

export type RecordingUploadErrorCode =
  'unsupported_type' | 'file_too_large' | 'quota_exceeded' | 'missing_title'

export class RecordingUploadError extends Error {
  code: RecordingUploadErrorCode

  constructor(code: RecordingUploadErrorCode) {
    super(code)
    this.code = code
  }
}

export type RecordingFileChoice = {
  extension: 'mp4' | 'webm' | 'mov'
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime'
}

export function recordingStoragePath(
  accountId: string,
  recordingId: string,
  extension: RecordingFileChoice['extension'],
) {
  return `${accountId}/${recordingId}.${extension}`
}

export function validateRecordingFile(
  file: { name: string; type: string; size: number },
  remainingBytes: number,
): RecordingFileChoice {
  const rawExtension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const type = file.type.toLowerCase()
  const extensionAllowed = EXTENSIONS.has(rawExtension)
  const typeAllowed = MIME_TYPES.has(type)

  if (!extensionAllowed && !typeAllowed) {
    throw new RecordingUploadError('unsupported_type')
  }
  if (file.size <= 0 || file.size > RECORDING_MAX_BYTES) {
    throw new RecordingUploadError('file_too_large')
  }
  if (file.size > remainingBytes) {
    throw new RecordingUploadError('quota_exceeded')
  }

  if (rawExtension === 'webm' || (!extensionAllowed && type === 'video/webm')) {
    return { extension: 'webm', contentType: 'video/webm' }
  }
  if (
    rawExtension === 'mov' ||
    (!extensionAllowed && type === 'video/quicktime')
  ) {
    return { extension: 'mov', contentType: 'video/quicktime' }
  }
  return { extension: 'mp4', contentType: 'video/mp4' }
}

export function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      finish(
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration)
          : null,
      )
    }
    video.onerror = () => finish(null)
    video.src = url
  })
}
