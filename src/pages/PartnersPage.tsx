import { useTranslation } from 'react-i18next'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useNavigate } from 'react-router'

export function PartnersPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-foreground text-4xl font-bold tracking-tight">
        {t('partners.title', 'Partner with NewWebinars')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
        {t(
          'partners.subtitle',
          'Earn 30% commission for the first 12 months by referring customers',
        )}
      </p>

      <Card className="mt-12 p-8">
        <CardTitle>
          {t('partners.commissionTitle', '30% recurring commission')}
        </CardTitle>
        <CardDescription className="mt-2">
          {t(
            'partners.commissionDescription',
            'For every customer you refer, earn commission on their payments for the first 12 months.',
          )}
        </CardDescription>
        <Button className="mt-6" onClick={() => navigate('/login')}>
          {t('partners.cta', 'Become a partner')}
        </Button>
      </Card>
    </div>
  )
}
