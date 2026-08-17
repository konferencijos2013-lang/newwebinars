import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Plus, Video, LayoutTemplate, BarChart3, Film } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useUser } from '@/features/auth/hooks/useUser'
import { supportPath, useSupportView } from '@/features/support/useSupportView'

export function DashboardPage() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { status, user } = useUser()
  const supportView = useSupportView()
  const path = (to: string) => supportPath(supportView?.basePath ?? null, to)

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          {t('dashboard.title', 'Dashboard')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {user?.email ?? t('navigation.user', 'User')}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Video className="text-primary h-5 w-5" />
            {t('navigation.webinars')}
          </CardTitle>
          <CardDescription className="mt-2">
            {t('dashboard.webinarsDescription', 'Create and manage webinars')}
          </CardDescription>
          <Button
            className="mt-4 w-full"
            onClick={() => navigate(path('/webinars'))}
          >
            {t('dashboard.open', 'Open')}
          </Button>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <LayoutTemplate className="text-primary h-5 w-5" />
            {t('navigation.funnels')}
          </CardTitle>
          <CardDescription className="mt-2">
            {t(
              'dashboard.funnelsDescription',
              'Build registration and sales pages',
            )}
          </CardDescription>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => navigate(path('/funnels'))}
          >
            {t('dashboard.open', 'Open')}
          </Button>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Film className="text-primary h-5 w-5" />
            {t('navigation.recordings')}
          </CardTitle>
          <CardDescription className="mt-2">
            {t(
              'dashboard.recordingsDescription',
              'Manage recordings and storage',
            )}
          </CardDescription>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => navigate(path('/recordings'))}
          >
            {t('dashboard.open', 'Open')}
          </Button>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-primary h-5 w-5" />
            {t('navigation.analytics')}
          </CardTitle>
          <CardDescription className="mt-2">
            {t('dashboard.analyticsDescription', 'View performance and usage')}
          </CardDescription>
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => navigate(path('/analytics'))}
          >
            {t('dashboard.open', 'Open')}
          </Button>
        </Card>

        {!supportView ? (
          <Card>
            <CardTitle className="flex items-center gap-2">
              <Plus className="text-primary h-5 w-5" />
              {t('dashboard.createTitle', 'Create webinar')}
            </CardTitle>
            <CardDescription className="mt-2">
              {t(
                'dashboard.createDescription',
                'Start a new live or automated webinar',
              )}
            </CardDescription>
            <Button
              className="mt-4 w-full"
              onClick={() => navigate('/webinars/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.createButton', 'Create')}
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
