import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Zap, Receipt, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  fetchCreditPlans,
  fetchAccountCredits,
  fetchUsageEvents,
  fetchSubscription,
  fetchPayments,
  createCheckoutSession,
} from '@/features/billing/api/billing'
import type {
  CreditPlan,
  AccountCredit,
  UsageEvent,
  Subscription,
  Payment,
} from '@/shared/database.types'

const displayLimitKeys = [
  'max_webinars',
  'max_participants_per_webinar',
  'max_team_members',
] as const

const displayCreditKeys = [
  'live_webinar_minute',
  'automated_webinar_minute',
  'registration',
  'recording_storage_gb_month',
  'ai_token',
] as const

export function BillingPage() {
  const { t, i18n } = useTranslation('billing')
  const account = useAccount()
  const [plans, setPlans] = useState<CreditPlan[]>([])
  const [credits, setCredits] = useState<AccountCredit[]>([])
  const [usage, setUsage] = useState<UsageEvent[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)

  useEffect(() => {
    if (checkoutUrl && typeof document !== 'undefined') {
      window.location.assign(checkoutUrl)
    }
  }, [checkoutUrl])

  useEffect(() => {
    if (account.status !== 'ready') return
    let isActive = true

    Promise.all([
      fetchCreditPlans(),
      fetchAccountCredits(account.account.id).catch(
        () => [] as AccountCredit[],
      ),
      fetchUsageEvents(account.account.id).catch(() => [] as UsageEvent[]),
      fetchSubscription(account.account.id).catch(() => null),
      fetchPayments(account.account.id).catch(() => [] as Payment[]),
    ])
      .then(([p, c, u, s, pay]) => {
        if (!isActive) return
        setPlans(p)
        setCredits(c)
        setUsage(u)
        setSubscription(s)
        setPayments(pay)
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

  const currentPlan = useMemo(
    () =>
      plans.find((plan) => plan.id === subscription?.credit_plan_id) ??
      plans.find((plan) => plan.is_default) ??
      null,
    [plans, subscription],
  )

  const visiblePlans = useMemo(() => {
    const selectedPlanId = currentPlan?.id
    return plans.filter(
      (plan) =>
        plan.is_default ||
        plan.id === selectedPlanId ||
        (plan.price_cents > 0 && Boolean(plan.stripe_price_id)),
    )
  }, [currentPlan?.id, plans])

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language, i18n.resolvedLanguage],
  )

  async function handleSubscribe(planId: string) {
    if (account.status !== 'ready') return
    setCheckoutLoading(planId)
    try {
      const { url } = await createCheckoutSession(account.account.id, planId)
      setCheckoutUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCheckoutLoading(null)
    }
  }

  function formatCurrency(cents: number) {
    return currencyFormatter.format(cents / 100)
  }

  function planFeatures(plan: CreditPlan) {
    const limits = plan.limits as Record<string, number>
    const credits = plan.monthly_credits as Record<string, number>
    return [
      ...displayLimitKeys.flatMap((key) =>
        limits[key] === undefined
          ? []
          : [t(`features.${key}`, { value: limits[key] })],
      ),
      ...displayCreditKeys.flatMap((key) =>
        credits[key] === undefined
          ? []
          : [t(`features.${key}`, { value: credits[key] })],
      ),
    ]
  }

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{t('errorLoading')}</p>
            <p className="text-sm opacity-90">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" /> {t('credits')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {credits.reduce((sum, c) => sum + c.balance, 0)}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> {t('plan')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {currentPlan?.name ?? t('freePlan')}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> {t('invoices')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {payments.length}
          </CardDescription>
        </Card>
      </div>

      <div>
        <h2 className="text-foreground mb-3 text-lg font-semibold">
          {t('plans')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlans.map((plan) => {
            const isCurrent = plan.id === currentPlan?.id
            const canPurchase =
              plan.price_cents > 0 && Boolean(plan.stripe_price_id)
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : ''}>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="mt-2">
                  {formatCurrency(plan.price_cents)}/
                  {t(`interval.${plan.interval}`)}
                </CardDescription>
                <ul className="text-muted-foreground mt-4 space-y-1 text-sm">
                  {planFeatures(plan).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  variant={isCurrent || plan.is_default ? 'outline' : 'default'}
                  isLoading={checkoutLoading === plan.id}
                  disabled={
                    !canPurchase || isCurrent || checkoutLoading === plan.id
                  }
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {isCurrent || plan.is_default
                    ? t('currentPlan')
                    : t('subscribe')}
                </Button>
              </Card>
            )
          })}
        </div>
      </div>

      {usage.length > 0 && (
        <div>
          <h2 className="text-foreground mb-3 text-lg font-semibold">
            {t('recentUsage')}
          </h2>
          <Card>
            <div className="space-y-2">
              {usage.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <span className="text-sm capitalize">
                    {event.credit_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(event.created_at).toLocaleDateString(
                      i18n.resolvedLanguage ?? i18n.language,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {payments.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <Receipt className="text-muted-foreground mb-4 h-10 w-10" />
          <CardTitle>{t('emptyTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('emptyDescription')}
          </CardDescription>
        </Card>
      )}
    </div>
  )
}
