import { useTranslation } from 'react-i18next'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { WaitingRoomRuntime } from './WaitingRoomRuntime'

export function WaitingRoomContent({
  webinarSlug,
  funnelSlug,
  token,
  isPreview = false,
}: {
  webinarSlug?: string | null
  funnelSlug?: string | null
  token?: string | null
  isPreview?: boolean
}) {
  const { t } = useTranslation('public')

  if (isPreview) {
    return (
      <div className="mx-auto max-w-3xl py-8 text-center">
        <Card>
          <CardTitle className="text-2xl">{t('waitingRoomTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('waitingRoomDescription')}
          </CardDescription>
          <div className="mt-8 text-5xl font-bold tabular-nums">00:15:00</div>
          <button
            type="button"
            disabled
            className="bg-primary text-primary-foreground mt-8 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium opacity-70"
          >
            {t('enterRoom')}
          </button>
        </Card>
      </div>
    )
  }

  return (
    <WaitingRoomRuntime
      webinarSlug={webinarSlug ?? ''}
      accessToken={token ?? ''}
      roomDestination={
        funnelSlug
          ? ({ registration }) =>
              `/f/${funnelSlug}/room?token=${encodeURIComponent(registration.access_token)}`
          : undefined
      }
      className="mx-auto max-w-3xl py-8 text-center"
    />
  )
}
