import { describe, expect, it } from 'vitest'
import {
  RECORDING_MAX_BYTES,
  RecordingUploadError,
  recordingStoragePath,
  validateRecordingFile,
} from './recordingFile'

describe('validateRecordingFile', () => {
  it('accepts mp4, webm, mov, and m4v files', () => {
    expect(
      validateRecordingFile(
        { name: 'talk.mp4', type: 'video/mp4', size: 2048 },
        RECORDING_MAX_BYTES,
      ),
    ).toEqual({ extension: 'mp4', contentType: 'video/mp4' })
    expect(
      validateRecordingFile(
        { name: 'talk.webm', type: '', size: 2048 },
        RECORDING_MAX_BYTES,
      ),
    ).toEqual({ extension: 'webm', contentType: 'video/webm' })
    expect(
      validateRecordingFile(
        { name: 'talk.mov', type: 'video/quicktime', size: 2048 },
        RECORDING_MAX_BYTES,
      ),
    ).toEqual({ extension: 'mov', contentType: 'video/quicktime' })
    expect(
      validateRecordingFile(
        { name: 'talk.m4v', type: 'video/x-m4v', size: 2048 },
        RECORDING_MAX_BYTES,
      ),
    ).toEqual({ extension: 'mp4', contentType: 'video/mp4' })
  })

  it('rejects files that are not videos', () => {
    expect(() =>
      validateRecordingFile(
        { name: 'notes.png', type: 'image/png', size: 2048 },
        RECORDING_MAX_BYTES,
      ),
    ).toThrow(RecordingUploadError)
  })

  it('rejects files larger than 2 GB or the remaining quota', () => {
    expect(() =>
      validateRecordingFile(
        { name: 'long.mp4', type: 'video/mp4', size: RECORDING_MAX_BYTES + 1 },
        RECORDING_MAX_BYTES + 10,
      ),
    ).toThrow(expect.objectContaining({ code: 'file_too_large' }))

    expect(() =>
      validateRecordingFile(
        { name: 'long.mp4', type: 'video/mp4', size: 500 },
        499,
      ),
    ).toThrow(expect.objectContaining({ code: 'quota_exceeded' }))
  })
})

describe('recordingStoragePath', () => {
  it('keeps the file inside the account folder', () => {
    expect(recordingStoragePath('account-1', 'recording-1', 'webm')).toBe(
      'account-1/recording-1.webm',
    )
  })
})
