import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router'

type Interval = 'month' | 'year'

export function PricingPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const [interval, setInterval] = useState<Interval>('month')
  const plans = ['free', 'start', 'grow', 'scale'].map((code) => ({
    code,
    name: t(`pricing.${code}.name`),
    price:
      code === 'free'
        ? t(`pricing.${code}.price`)
        : t(`pricing.${code}.${interval}Price`),
    features: t(`pricing.${code}.features`, {
      returnObjects: true,
    }) as string[],
  }))
  function selectPlan(code: string) {
    const target =
      code === 'free'
        ? '/dashboard'
        : `/billing?plan=${encodeURIComponent(`${code}-${interval}`)}&interval=${interval}`
    navigate(`/login?returnTo=${encodeURIComponent(target)}`)
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-foreground text-4xl font-bold tracking-tight">
        {t('pricing.title')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
        {t('pricing.subtitle')}
      </p>
      <div className="mt-6 inline-flex rounded-lg border p-1">
        <Button
          size="sm"
          variant={interval === 'month' ? 'default' : 'ghost'}
          onClick={() => setInterval('month')}
        >
          {t('pricing.monthly')}
        </Button>
        <Button
          size="sm"
          variant={interval === 'year' ? 'default' : 'ghost'}
          onClick={() => setInterval('year')}
        >
          {t('pricing.yearly')}
        </Button>
      </div>
      {interval === 'year' && (
        <p className="text-muted-foreground mt-3 text-sm">
          {t('pricing.annualCreditsExplanation')}
        </p>
      )}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.code} className="flex flex-col p-8 text-left">
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <p className="text-foreground mt-4 text-3xl font-bold">
              {plan.price}
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 w-full"
              onClick={() => selectPlan(plan.code)}
            >
              {plan.code === 'free' ? t('pricing.freeCta') : t('pricing.cta')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
