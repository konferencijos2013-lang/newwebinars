import { useTranslation } from 'react-i18next'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Users } from 'lucide-react'

export function AffiliatePage() {
  const { t } = useTranslation('webinars')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('affiliate.title', 'Affiliate')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('affiliate.subtitle', 'Refer NewWebinars and earn commission')}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-4">
        <Card>
          <CardTitle>{t('affiliate.clicks', 'Clicks')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('affiliate.signups', 'Signups')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('affiliate.conversions', 'Conversions')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
        <Card>
          <CardTitle>{t('affiliate.earnings', 'Earnings')}</CardTitle>
          <CardDescription className="mt-2">0</CardDescription>
        </Card>
      </div>

      <Card className="mt-6 flex flex-col items-center justify-center py-12 text-center">
        <Users className="text-muted-foreground mb-4 h-10 w-10" />
        <CardTitle>
          {t('affiliate.emptyTitle', 'Affiliate program coming soon')}
        </CardTitle>
      </Card>
    </div>
  )
}
