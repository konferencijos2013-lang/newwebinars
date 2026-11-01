import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, Clock, HardDrive, Trash, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { RecordingUploadError } from '@/features/recordings/recordingFile'
import {
  archiveRecording,
  deleteRecording,
  ensureStorageUsage,
  fetchRecordings,
  getRecordingPlaybackUrl,
  uploadRecording,
} from '@/features/recordings/api/recordings'
import { fetchWebinars } from '@/features/webinars/api/webinars'
import { useSupportView } from '@/features/support/useSupportView'
import type {
  AccountStorageUsage,
  Recording,
  Webinar,
} from '@/shared/database.types'

export function RecordingsPage() {
  const { t } = useTranslation('recordings')
  const account = useAccount()
  const supportView = useSupportView()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [usage, setUsage] = useState<AccountStorageUsage | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [webinarId, setWebinarId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [player, setPlayer] = useState<{ title: string; url: string } | null>(
    null,
  )

  const accountId = account.status === 'ready' ? account.account.id : null

  const load = useCallback(async (nextAccountId: string) => {
    const [nextRecordings, nextUsage, nextWebinars] = await Promise.all([
      fetchRecordings(nextAccountId),
      ensureStorageUsage(nextAccountId).catch(() => null),
      fetchWebinars(nextAccountId).catch(() => [] as Webinar[]),
    ])
    setRecordings(nextRecordings)
    setUsage(nextUsage)
    setWebinars(nextWebinars)
  }, [])

  useEffect(() => {
    if (!accountId) return
    let isActive = true
    Promise.all([
      fetchRecordings(accountId),
      ensureStorageUsage(accountId).catch(() => null),
      fetchWebinars(accountId).catch(() => [] as Webinar[]),
    ])
      .then(([nextRecordings, nextUsage, nextWebinars]) => {
        if (!isActive) return
        setRecordings(nextRecordings)
        setUsage(nextUsage)
        setWebinars(nextWebinars)
        setStatus('ready')
      })
      .catch(() => {
        if (isActive) setStatus('error')
      })
    return () => {
      isActive = false
    }
  }, [accountId])

  function resetUploadForm() {
    setTitle('')
    setDescription('')
    setWebinarId('')
    setFile(null)
  }

  function messageFor(error: unknown) {
    const code =
      error instanceof RecordingUploadError
        ? error.code
        : error instanceof Error
          ? error.message
          : ''
    if (code === 'unsupported_type') return t('unsupportedType')
    if (code === 'file_too_large') return t('fileTooLarge')
    if (code === 'quota_exceeded' || code.includes('storage_quota_exceeded')) {
      return t('quotaExceeded')
    }
    if (code === 'missing_title') return t('missingTitle')
    return t('uploadError')
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault()
    if (!accountId || !file) return
    setUploading(true)
    setActionError(null)
    try {
      await uploadRecording({
        accountId,
        file,
        title,
        description,
        webinarId: webinarId || null,
      })
      await load(accountId)
      resetUploadForm()
      setUploadOpen(false)
    } catch (error) {
      setActionError(messageFor(error))
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!accountId || !window.confirm(t('deleteConfirm'))) return
    setActionError(null)
    try {
      await deleteRecording(id)
      await load(accountId)
    } catch {
      setActionError(t('deleteError'))
    }
  }

  async function handleArchive(id: string) {
    setActionError(null)
    try {
      await archiveRecording(id)
      setRecordings((prev) =>
        prev.map((recording) =>
          recording.id === id
            ? { ...recording, status: 'archived' }
            : recording,
        ),
      )
    } catch {
      setActionError(t('archiveError'))
    }
  }

  async function handlePlay(recording: Recording) {
    setPlayingId(recording.id)
    setActionError(null)
    try {
      const url = await getRecordingPlaybackUrl(recording)
      setPlayer({ title: recording.title, url })
    } catch {
      setActionError(t('playError'))
    } finally {
      setPlayingId(null)
    }
  }

  const totalBytes = usage?.total_bytes ?? 0
  const quotaBytes = usage?.quota_bytes ?? 0
  const usagePercent = quotaBytes > 0 ? (totalBytes / quotaBytes) * 100 : 0

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const idx = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1,
    )
    return `${(bytes / Math.pow(k, idx)).toFixed(1)} ${sizes[idx]}`
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return '-'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  if (account.status === 'loading' || (accountId && status === 'loading')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (account.status !== 'ready' || status === 'error') {
    return (
      <div className="mx-auto max-w-5xl">
        <Card className="py-12 text-center">
          <CardTitle>{t('loadError')}</CardTitle>
          {accountId ? (
            <Button
              className="mt-4"
              onClick={() => {
                setStatus('loading')
                load(accountId)
                  .then(() => setStatus('ready'))
                  .catch(() => setStatus('error'))
              }}
            >
              {t('retry')}
            </Button>
          ) : null}
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        {!supportView ? (
          <Button
            onClick={() => {
              setActionError(null)
              setUploadOpen(true)
            }}
          >
            {t('upload')}
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
          {actionError}
        </p>
      ) : null}

      {usage ? (
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <HardDrive className="text-muted-foreground h-6 w-6" />
              <div>
                <p className="font-semibold">{t('storage')}</p>
                <p className="text-muted-foreground text-sm">
                  {formatBytes(totalBytes)} {t('of')} {formatBytes(quotaBytes)}
                </p>
              </div>
            </div>
            <span className="text-sm font-medium">
              {t('count', { count: usage.recordings_count })}
            </span>
          </div>
          <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </Card>
      ) : null}

      {recordings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="text-muted-foreground mb-4 h-12 w-12" />
          <CardTitle>{t('emptyTitle')}</CardTitle>
          <CardDescription className="mt-2 max-w-sm">
            {t('emptyDescription')}
          </CardDescription>
          {!supportView ? (
            <Button className="mt-6" onClick={() => setUploadOpen(true)}>
              {t('upload')}
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((recording) => (
            <Card key={recording.id} className="flex flex-col">
              <button
                type="button"
                className="bg-muted flex aspect-video items-center justify-center rounded-md"
                disabled={
                  playingId === recording.id ||
                  (recording.status !== 'ready' &&
                    recording.status !== 'archived')
                }
                onClick={() => handlePlay(recording)}
              >
                {playingId === recording.id ? (
                  <Spinner className="h-8 w-8" />
                ) : (
                  <Film className="text-muted-foreground h-10 w-10" />
                )}
              </button>
              <div className="mt-4 flex-1">
                <h3 className="font-semibold">{recording.title}</h3>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                  {recording.description || t('noDescription')}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span>{t(recording.status)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(recording.duration_seconds)}
                  </span>
                  <span>{formatBytes(recording.size_bytes)}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={
                    playingId === recording.id ||
                    (recording.status !== 'ready' &&
                      recording.status !== 'archived')
                  }
                  isLoading={playingId === recording.id}
                  onClick={() => handlePlay(recording)}
                >
                  {t('play')}
                </Button>
                {!supportView && recording.status === 'ready' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleArchive(recording.id)}
                  >
                    {t('archive')}
                  </Button>
                ) : null}
                {!supportView ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(recording.id)}
                    aria-label={t('delete')}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
              <CardTitle>{t('uploadTitle')}</CardTitle>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!uploading) setUploadOpen(false)
                }}
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleUpload}>
              <div className="space-y-2">
                <Label htmlFor="recording-title">{t('titleLabel')}</Label>
                <Input
                  id="recording-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recording-description">
                  {t('descriptionLabel')}
                </Label>
                <Textarea
                  id="recording-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recording-webinar">{t('webinarLabel')}</Label>
                <Select
                  id="recording-webinar"
                  value={webinarId}
                  onChange={(event) => setWebinarId(event.target.value)}
                >
                  <option value="">{t('webinarNone')}</option>
                  {webinars.map((webinar) => (
                    <option key={webinar.id} value={webinar.id}>
                      {webinar.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recording-file">{t('fileLabel')}</Label>
                <Input
                  id="recording-file"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                  required
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-muted-foreground text-xs">{t('fileHint')}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => setUploadOpen(false)}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" isLoading={uploading}>
                  {t('upload')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {player ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPlayer(null)}
        >
          <div
            className="w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4 text-white">
              <p className="font-medium">{player.title}</p>
              <button
                type="button"
                onClick={() => setPlayer(null)}
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <video
              key={player.url}
              src={player.url}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-lg bg-black"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
