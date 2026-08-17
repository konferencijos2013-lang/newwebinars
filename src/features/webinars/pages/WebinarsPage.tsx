import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Plus, Video, Calendar, Users, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { fetchWebinars } from '@/features/webinars/api/webinars'
import { supportPath, useSupportView } from '@/features/support/useSupportView'
import type { Webinar } from '@/shared/database.types'

export function WebinarsPage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const account = useAccount()
  const supportView = useSupportView()
  const path = (to: string) => supportPath(supportView?.basePath ?? null, to)
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (account.status !== 'ready') return

    let isActive = true

    fetchWebinars(account.account.id)
      .then((data) => {
        if (!isActive) return
        setWebinars(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [account.status, account.account?.id])

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (account.status === 'error' || status === 'error') {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{t('errorLoading')}</p>
            <p className="text-sm opacity-90">{error ?? account.status}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              {t('tryAgain')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (account.status === 'empty') {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {t('title')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
          </div>
        </div>
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">{t('noWebinars')}</p>
        </Card>
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
        {!supportView ? (
          <Button onClick={() => navigate(path('/webinars/new'))}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create')}
          </Button>
        ) : null}
      </div>

      {webinars.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Video className="text-muted-foreground mb-4 h-12 w-12" />
          <CardTitle>{t('emptyTitle')}</CardTitle>
          <CardDescription className="mt-2 max-w-sm">
            {t('emptyDescription')}
          </CardDescription>
          {!supportView ? (
            <Button
              className="mt-6"
              onClick={() => navigate(path('/webinars/new'))}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('create')}
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {webinars.map((webinar) => (
            <Card
              key={webinar.id}
              className="hover:border-primary/50 cursor-pointer transition-colors"
              onClick={() => navigate(path(`/webinars/${webinar.id}`))}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{webinar.title}</h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {webinar.description ?? t('webinarDescriptionPlaceholder')}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    webinar.status === 'published'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                  }`}
                >
                  {webinar.status === 'published' ? t('published') : t('draft')}
                </span>
              </div>
              <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {webinar.type === 'live'
                    ? webinar.scheduled_at
                      ? new Date(webinar.scheduled_at).toLocaleDateString()
                      : t('scheduleOnDemand')
                    : t('automated')}
                </span>
                {webinar.max_participants ? (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {webinar.max_participants}
                  </span>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
