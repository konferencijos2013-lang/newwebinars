import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit,
  Globe,
  Lock,
  Radio,
  MessageSquare,
  Trash,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchWebinar,
  fetchWebinarSchedules,
  publishWebinar,
  deleteWebinar,
} from '@/features/webinars/api/webinars'
import { supportPath, useSupportView } from '@/features/support/useSupportView'
import type { Webinar, WebinarSchedule } from '@/shared/database.types'

export function WebinarDetailPage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const supportView = useSupportView()
  const path = (to: string) => supportPath(supportView?.basePath ?? null, to)

  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [schedules, setSchedules] = useState<WebinarSchedule[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let isActive = true

    Promise.all([fetchWebinar(id), fetchWebinarSchedules(id)])
      .then(([w, s]) => {
        if (!isActive) return
        setWebinar(w)
        setSchedules(s)
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
  }, [id])

  async function handlePublish() {
    if (!webinar) return
    try {
      const updated = await publishWebinar(webinar.id)
      setWebinar(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete() {
    if (!webinar) return
    if (!window.confirm(t('deleteConfirm'))) return
    try {
      await deleteWebinar(webinar.id)
      navigate(path('/webinars'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !webinar) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="text-center">
          <CardTitle>{t('errorNotFound')}</CardTitle>
          <CardDescription className="mt-2">
            {error ?? t('errorNotFound')}
          </CardDescription>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate(path('/webinars'))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
        </Card>
      </div>
    )
  }

  const accessIcons = {
    public: <Globe className="h-4 w-4" />,
    password_protected: <Lock className="h-4 w-4" />,
    paid_access: <Lock className="h-4 w-4" />,
    invited_only: <Lock className="h-4 w-4" />,
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate(path('/webinars'))}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('cancel')}
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {webinar.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('slug')}: {webinar.slug}
          </p>
        </div>
        {!supportView ? (
          <div className="flex shrink-0 gap-2">
            {webinar.status !== 'published' && (
              <Button size="sm" onClick={handlePublish}>
                {t('publish')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/webinars/${webinar.id}/edit`)}
            >
              <Edit className="mr-2 h-4 w-4" />
              {t('save')}
            </Button>
            {webinar.type === 'live' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/webinars/${webinar.id}/host`)}
              >
                <Radio className="mr-2 h-4 w-4" />
                {t('hostStream')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/webinars/${webinar.id}/chat-script`)}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {t('chatScenario')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash className="mr-2 h-4 w-4" />
              {t('delete')}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="text-base">{t('settings')}</CardTitle>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                {webinar.type === 'live'
                  ? webinar.scheduled_at
                    ? new Date(webinar.scheduled_at).toLocaleString()
                    : t('scheduleOnDemand')
                  : t('automated')}
              </span>
            </div>
            {webinar.duration_minutes ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>
                  {webinar.duration_minutes} {t('durationMinutes')}
                </span>
              </div>
            ) : null}
            {webinar.max_participants ? (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>
                  {webinar.max_participants} {t('maxParticipants')}
                </span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {accessIcons[webinar.access_mode]}
              <span className="capitalize">
                {t(`access${webinar.access_mode.replace(/_/g, '')}` as const)}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle className="text-base">{t('schedules')}</CardTitle>
          <CardDescription className="mt-1">
            {schedules.length === 0
              ? t('scheduleOnDemand')
              : `${schedules.length} schedule(s)`}
          </CardDescription>
          {!supportView ? (
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/webinars/${webinar.id}/schedules`)}
            >
              {t('addSchedule')}
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
