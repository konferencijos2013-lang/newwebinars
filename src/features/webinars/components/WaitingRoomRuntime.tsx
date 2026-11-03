import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { localizedPath } from '@/i18n/localePath'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { trackAnalyticsEvent } from '@/features/analytics/dataLayer'
import {
  fetchRegistrationByToken,
  fetchWebinarBySlug,
  getManyChatLinkOptions,
  getTelegramLinkOptions,
  markEnteredWaitingRoom,
  startWebinarTicketCheckout,
  type ManyChatLinkOption,
  type TelegramLinkOption,
} from '@/features/webinars/api/public'
import type { Registration, Webinar } from '@/shared/database.types'
import {
  getStandardWaitingRoomDestination,
  type WaitingRoomDestinationContext,
} from './waitingRoomDestination'
export type { WaitingRoomDestinationContext } from './waitingRoomDestination'

export interface WaitingRoomRuntimeProps {
  webinarSlug: string
  accessToken: string
  /** Override the standard webinar room URL, e.g. a funnel room page. */
  roomDestination?:
    string | ((context: WaitingRoomDestinationContext) => string)
  onNavigate?: (destination: string) => void
  className?: string
}

export function WaitingRoomRuntime(props: WaitingRoomRuntimeProps) {
  const { t } = useTranslation('public')
  if (!props.webinarSlug || !props.accessToken) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold">{t('errorNotFound')}</h1>
      </div>
    )
  }

  return (
    <WaitingRoomRuntimeContent
      key={`${props.webinarSlug}:${props.accessToken}`}
      {...props}
    />
  )
}

function WaitingRoomRuntimeContent({
  webinarSlug,
  accessToken,
  roomDestination = getStandardWaitingRoomDestination,
  onNavigate,
  className = 'mx-auto max-w-3xl py-16 text-center',
}: WaitingRoomRuntimeProps) {
  const { t } = useTranslation('public')
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [now, setNow] = useState(() => Date.now())
  const [manyChatLinks, setManyChatLinks] = useState<ManyChatLinkOption[]>([])
  const [manyChatError, setManyChatError] = useState<string | null>(null)
  const [telegramLinks, setTelegramLinks] = useState<TelegramLinkOption[]>([])
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    Promise.all([
      fetchWebinarBySlug(webinarSlug),
      fetchRegistrationByToken(accessToken).catch(() => null),
    ])
      .then(([loadedWebinar, loadedRegistration]) => {
        if (!isActive) return
        if (
          !loadedRegistration ||
          loadedRegistration.webinar_id !== loadedWebinar.id
        ) {
          setStatus('error')
          return
        }

        setWebinar(loadedWebinar)
        setRegistration(loadedRegistration)
        setStatus('ready')

        markEnteredWaitingRoom(accessToken)
          .then(() =>
            trackAnalyticsEvent('webinar_entry', {
              webinar_id: loadedWebinar.id,
              entry_point: 'waiting_room',
            }),
          )
          .catch(() => {})

        getManyChatLinkOptions(accessToken)
          .then((links) => {
            if (isActive) setManyChatLinks(links)
          })
          .catch(() => {
            if (isActive)
              setManyChatError('Nepavyko paruošti susiejimo su žinučių kanalu.')
          })

        getTelegramLinkOptions(accessToken)
          .then((links) => {
            if (isActive) setTelegramLinks(links)
          })
          .catch(() => {
            if (isActive)
              setTelegramError('Nepavyko paruošti susiejimo su Telegram.')
          })
      })
      .catch(() => {
        if (isActive) setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [accessToken, webinarSlug])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!registration?.payment_required || registration.paid_at) return
    const id = window.setInterval(() => {
      void fetchRegistrationByToken(accessToken)
        .then((next) => {
          if (next.paid_at) setRegistration(next)
        })
        .catch(() => {})
    }, 3000)
    return () => window.clearInterval(id)
  }, [accessToken, registration?.paid_at, registration?.payment_required])

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
  const seconds = Math.floor((diff / 1_000) % 60)
  const minutes = Math.floor((diff / 1_000 / 60) % 60)
  const hours = Math.floor(diff / 1_000 / 60 / 60)
  const canEnter =
    !startTime ||
    now >= startTime - (webinar.early_entry_minutes ?? 15) * 60 * 1_000
  const pendingManyChatLink = manyChatLinks.find(
    (link) => link.status === 'pending' && link.connect_url,
  )
  const pendingTelegramLink = telegramLinks.find(
    (link) => link.status === 'pending' && link.connect_url,
  )

  const readyWebinar = webinar
  const readyRegistration = registration

  function enterRoom() {
    const context: WaitingRoomDestinationContext = {
      webinar: readyWebinar,
      registration: readyRegistration,
      accessToken,
    }
    const destination =
      typeof roomDestination === 'function'
        ? roomDestination(context)
        : roomDestination
    if (onNavigate) onNavigate(destination)
    else window.location.assign(localizedPath(destination))
  }

  return (
    <div className={className}>
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

        {pendingManyChatLink?.connect_url && (
          <a
            className="border-input bg-background hover:bg-accent mt-5 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors"
            href={pendingManyChatLink.connect_url}
            target="_blank"
            rel="noreferrer"
          >
            Gauti priminimus per ManyChat
          </a>
        )}
        {manyChatLinks.some((link) => link.status === 'linked') && (
          <p className="mt-5 text-sm text-emerald-700 dark:text-emerald-300">
            ManyChat priminimai prijungti.
          </p>
        )}
        {manyChatError && (
          <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
            {manyChatError}
          </p>
        )}

        {pendingTelegramLink?.connect_url && (
          <a
            className="border-input bg-background hover:bg-accent mt-5 ml-2 inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors"
            href={pendingTelegramLink.connect_url}
            target="_blank"
            rel="noreferrer"
          >
            Gauti webinarų priminimus ir naujienas per Telegram
          </a>
        )}
        {telegramLinks.some((link) => link.status === 'linked') && (
          <p className="mt-5 text-sm text-emerald-700 dark:text-emerald-300">
            Telegram priminimai prijungti.
          </p>
        )}
        {telegramError && (
          <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
            {telegramError}
          </p>
        )}

        {registration.payment_required && !registration.paid_at ? (
          <div className="mt-8">
            <p className="text-muted-foreground mb-3 text-sm">
              Prieš įeinant reikia apmokėti vietą.
            </p>
            <Button
              isLoading={paying}
              onClick={() => {
                setPaying(true)
                setPayError(null)
                void startWebinarTicketCheckout(accessToken)
                  .catch(() =>
                    setPayError('Mokėjimo lango nepavyko atidaryti.'),
                  )
                  .finally(() => setPaying(false))
              }}
            >
              Apmokėti ir įeiti
            </Button>
            {payError ? (
              <p className="mt-3 text-sm text-red-600">{payError}</p>
            ) : null}
          </div>
        ) : (
          <Button className="mt-8" disabled={!canEnter} onClick={enterRoom}>
            {canEnter ? t('enterRoom') : t('roomNotOpen')}
          </Button>
        )}
      </Card>
    </div>
  )
}
