import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchWebinarBySlug,
  fetchRegistrationByToken,
  markEnteredWaitingRoom,
} from '@/features/webinars/api/public'
import type { Webinar, Registration } from '@/shared/database.types'

export function WaitingRoomPage() {
  const { t } = useTranslation('public')
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!slug || !token) return
    let isActive = true

    Promise.all([
      fetchWebinarBySlug(slug),
      fetchRegistrationByToken(token).catch(() => null),
    ])
      .then(([w, r]) => {
        if (!isActive) return
        if (!r) {
          setStatus('error')
          return
        }
        setWebinar(w)
        setRegistration(r)
        setStatus('ready')
        markEnteredWaitingRoom(token).catch(() => {})
      })
      .catch(() => {
        if (!isActive) return
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [slug, token])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !webinar || !registration) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold">{t('errorNotFound')}</h1>
      </div>
    )
  }

  const startTime = webinar.scheduled_at
    ? new Date(webinar.scheduled_at).getTime()
    : null
  const diff = startTime ? Math.max(0, startTime - now) : 0
  const seconds = Math.floor((diff / 1000) % 60)
  const minutes = Math.floor((diff / 1000 / 60) % 60)
  const hours = Math.floor(diff / 1000 / 60 / 60)

  const canEnter =
    !startTime ||
    now >= startTime - (webinar.early_entry_minutes ?? 15) * 60 * 1000

  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <Card>
        <CardTitle className="text-2xl">{webinar.title}</CardTitle>
        <CardDescription className="mt-2">
          {t('waitingRoomDescription')}
        </CardDescription>

        {startTime ? (
          <div className="mt-8 text-5xl font-bold tabular-nums">
            {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:
            {String(seconds).padStart(2, '0')}
          </div>
        ) : (
          <p className="text-muted-foreground mt-8">{t('onDemandReady')}</p>
        )}

        <Button
          className="mt-8"
          disabled={!canEnter}
          onClick={() =>
            (window.location.href = `/w/${webinar.slug}/room?token=${registration.access_token}`)
          }
        >
          {canEnter ? t('enterRoom') : t('roomNotOpen')}
        </Button>
      </Card>
    </div>
  )
}
