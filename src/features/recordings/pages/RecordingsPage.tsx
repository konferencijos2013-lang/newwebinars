import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, Clock, HardDrive, MoreVertical, Trash } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  fetchRecordings,
  fetchStorageUsage,
  deleteRecording,
  archiveRecording,
} from '@/features/recordings/api/recordings'
import { useSupportView } from '@/features/support/useSupportView'
import type { Recording, AccountStorageUsage } from '@/shared/database.types'

export function RecordingsPage() {
  const { t } = useTranslation('recordings')
  const account = useAccount()
  const supportView = useSupportView()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [usage, setUsage] = useState<AccountStorageUsage | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    if (account.status !== 'ready') return
    let isActive = true

    Promise.all([
      fetchRecordings(account.account.id).catch(() => [] as Recording[]),
      fetchStorageUsage(account.account.id).catch(() => null),
    ]).then(([r, u]) => {
      if (!isActive) return
      setRecordings(r)
      setUsage(u)
      setStatus('ready')
    })

    return () => {
      isActive = false
    }
  }, [account.status, account.account?.id])

  async function handleDelete(id: string) {
    if (!window.confirm(t('deleteConfirm'))) return
    try {
      await deleteRecording(id)
      setRecordings((prev) => prev.filter((rec) => rec.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveRecording(id)
      setRecordings((prev) =>
        prev.map((rec) =>
          rec.id === id ? { ...rec, status: 'archived' } : rec,
        ),
      )
    } catch (err) {
      console.error(err)
    }
  }

  const totalBytes = usage?.total_bytes ?? 0
  const quotaBytes = usage?.quota_bytes ?? 0
  const usagePercent = quotaBytes > 0 ? (totalBytes / quotaBytes) * 100 : 0

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const idx = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, idx)).toFixed(1)} ${sizes[idx]}`
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        {!supportView ? <Button disabled>{t('upload')}</Button> : null}
      </div>

      {usage && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
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
              {usage.recordings_count} recordings
            </span>
          </div>
          <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </Card>
      )}

      {recordings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="text-muted-foreground mb-4 h-12 w-12" />
          <CardTitle>{t('emptyTitle')}</CardTitle>
          <CardDescription className="mt-2 max-w-sm">
            {t('emptyDescription')}
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((recording) => (
            <Card key={recording.id} className="flex flex-col">
              <div className="bg-muted flex aspect-video items-center justify-center rounded-md">
                <Film className="text-muted-foreground h-10 w-10" />
              </div>
              <div className="mt-4 flex-1">
                <h3 className="font-semibold">{recording.title}</h3>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                  {recording.description || t('noDescription')}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 capitalize">
                    <MoreVertical className="h-3 w-3" />
                    {recording.status}
                  </span>
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
                  disabled={recording.status !== 'ready'}
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
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
