import { useTranslation } from 'react-i18next'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router'

export function PricingPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()

  const plans = ['free', 'start', 'grow', 'scale'].map((key) => ({
    name: t(`pricing.${key}.name`),
    price: t(`pricing.${key}.price`),
    annual: key === 'free' ? null : t(`pricing.${key}.annual`),
    features: t(`pricing.${key}.features`, { returnObjects: true }) as string[],
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-foreground text-4xl font-bold tracking-tight">
        {t('pricing.title')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
        {t('pricing.subtitle')}
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.name} className="flex flex-col p-8 text-left">
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <p className="text-foreground mt-4 text-3xl font-bold">
              {plan.price}
            </p>
            {plan.annual && (
              <p className="text-muted-foreground mt-1 text-sm">
                {plan.annual}
              </p>
            )}
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button className="mt-8 w-full" onClick={() => navigate('/login')}>
              {t('pricing.cta')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
