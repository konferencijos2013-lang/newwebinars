import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ArrowRight, Check, Sparkles, Zap } from 'lucide-react'
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
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-primary)_16%,transparent),transparent_70%)]" />
      <section className="mx-auto max-w-7xl px-4 pt-20 pb-24 text-center sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          {t('pricing.eyebrow')}
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold tracking-[-0.05em] sm:text-6xl">
          {t('pricing.title')}
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg leading-8">
          {t('pricing.subtitle')}
        </p>
        <div className="bg-card mt-9 inline-flex rounded-full border p-1.5 shadow-lg">
          <Button
            size="sm"
            variant={interval === 'month' ? 'default' : 'ghost'}
            className="rounded-full px-5"
            onClick={() => setInterval('month')}
          >
            {t('pricing.monthly')}
          </Button>
          <Button
            size="sm"
            variant={interval === 'year' ? 'default' : 'ghost'}
            className="rounded-full px-5"
            onClick={() => setInterval('year')}
          >
            {t('pricing.yearly')}
            <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              −20%
            </span>
          </Button>
        </div>
        {interval === 'year' && (
          <p className="text-muted-foreground mt-4 text-sm">
            {t('pricing.annualCreditsExplanation')}
          </p>
        )}
        <div className="mt-14 grid gap-5 text-left sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const featured = plan.code === 'grow'
            return (
              <article
                key={plan.code}
                className={`relative flex min-h-[440px] flex-col overflow-hidden rounded-3xl border p-7 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${featured ? 'border-primary shadow-primary/15 bg-[#111326] text-white shadow-2xl' : 'bg-card shadow-sm'}`}
              >
                {featured && (
                  <div className="bg-primary absolute inset-x-0 top-0 py-2 text-center text-[10px] font-bold tracking-[0.16em] text-white uppercase">
                    {t('pricing.popular')}
                  </div>
                )}
                <div className={featured ? 'pt-5' : ''}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">{plan.name}</h2>
                    {featured && (
                      <Zap className="h-5 w-5 fill-violet-400 text-violet-400" />
                    )}
                  </div>
                  <p
                    className={`mt-2 text-sm ${featured ? 'text-white/55' : 'text-muted-foreground'}`}
                  >
                    {t(`pricing.${plan.code}.description`)}
                  </p>
                  <p className="mt-7 text-3xl font-bold tracking-tight">
                    {plan.price}
                  </p>
                </div>
                <div
                  className={`my-7 h-px ${featured ? 'bg-white/10' : 'bg-border'}`}
                />
                <ul className="flex-1 space-y-3.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-3 text-sm ${featured ? 'text-white/75' : 'text-muted-foreground'}`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${featured ? 'bg-violet-500/20 text-violet-300' : 'bg-primary/10 text-primary'}`}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`mt-8 h-11 w-full rounded-full ${featured ? 'bg-white text-[#111326] hover:bg-white/90' : ''}`}
                  variant={featured ? 'outline' : 'default'}
                  onClick={() => selectPlan(plan.code)}
                >
                  {plan.code === 'free'
                    ? t('pricing.freeCta')
                    : t('pricing.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
