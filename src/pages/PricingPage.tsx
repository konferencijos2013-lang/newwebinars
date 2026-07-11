import { useTranslation } from 'react-i18next'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router'

export function PricingPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()

  const plans = [
    {
      name: t('pricing.free.name', 'Free'),
      price: '€0',
      features: [t('pricing.free.feature1', '1 webinar')],
    },
    {
      name: t('pricing.paid.name', 'Pay-as-you-go'),
      price: t('pricing.paid.price', 'From €10'),
      features: [
        t('pricing.paid.feature1', 'Credits for webinars'),
        t('pricing.paid.feature2', 'Recordings storage'),
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center">
      <h1 className="text-foreground text-4xl font-bold tracking-tight">
        {t('pricing.title', 'Simple pricing')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
        {t('pricing.subtitle', 'Start free, scale with credits')}
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className="p-8 text-left">
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <p className="text-foreground mt-4 text-3xl font-bold">
              {plan.price}
            </p>
            <ul className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button className="mt-8 w-full" onClick={() => navigate('/login')}>
              {t('pricing.cta', 'Get started')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
