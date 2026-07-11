import { useTranslation } from 'react-i18next'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { BarChart3 } from 'lucide-react'

export function AnalyticsPage() {
  const { t } = useTranslation('webinars')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('analytics.title', 'Analytics')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('analytics.subtitle', 'Webinar performance and usage insights')}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-4">
        <Card>
          <CardTitle>{t('analytics.registrations', 'Registrations')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('analytics.attendees', 'Attendees')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('analytics.conversions', 'Conversions')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('analytics.revenue', 'Revenue')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
      </div>

      <Card className="mt-6 flex flex-col items-center justify-center py-12 text-center">
        <BarChart3 className="text-muted-foreground mb-4 h-10 w-10" />
        <CardTitle>
          {t('analytics.emptyTitle', 'Analytics coming soon')}
        </CardTitle>
      </Card>
    </div>
  )
}
