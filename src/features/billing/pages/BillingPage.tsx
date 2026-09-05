import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
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
  createCustomerPortalSession,
} from '@/features/billing/api/billing'
import type {
  CreditPlan,
  AccountCredit,
  UsageEvent,
  Subscription,
  Payment,
} from '@/shared/database.types'
import {
  trackAnalyticsEvent,
  trackPurchaseOnce,
} from '@/features/analytics/dataLayer'

type BillingInterval = 'month' | 'year'
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
const manageableSubscriptionStatuses = new Set([
  'active',
  'trialing',
  'past_due',
  'incomplete',
  'paused',
  'unpaid',
])

export function BillingPage() {
  const { t, i18n } = useTranslation('billing')
  const account = useAccount()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedInterval =
    searchParams.get('interval') === 'year' ? 'year' : 'month'
  const [interval, setInterval] = useState<BillingInterval>(requestedInterval)
  const [plans, setPlans] = useState<CreditPlan[]>([])
  const [credits, setCredits] = useState<AccountCredit[]>([])
  const [usage, setUsage] = useState<UsageEvent[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('success') !== '1') return
    const payment = payments
      .filter((candidate) => candidate.status === 'succeeded')
      .sort((a, b) =>
        String(b.paid_at ?? b.created_at).localeCompare(
          String(a.paid_at ?? a.created_at),
        ),
      )[0]
    if (!payment) return
    trackPurchaseOnce({
      transaction_id: payment.stripe_invoice_id ?? payment.id,
      currency: payment.currency.toUpperCase(),
      value: payment.amount_cents / 100,
    })
  }, [payments, searchParams])

  useEffect(() => {
    if (redirectUrl) window.location.assign(redirectUrl)
  }, [redirectUrl])

  useEffect(() => {
    if (account.status !== 'ready') return
    let active = true
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
        if (!active) return
        setPlans(p)
        setCredits(c)
        setUsage(u)
        setSubscription(s)
        setPayments(pay)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [account.status, account.account?.id])

  const currentPlan = useMemo(
    () =>
      plans.find(
        (p) =>
          subscription?.access_granted_at &&
          p.id === subscription.credit_plan_id,
      ) ??
      plans.find((p) => p.is_default) ??
      null,
    [plans, subscription],
  )
  const selectedPlanCode = searchParams.get('plan')?.toLowerCase() ?? null
  const visiblePlans = useMemo(
    () =>
      plans.filter(
        (p) => p.is_default || (p.interval === interval && p.price_cents > 0),
      ),
    [plans, interval],
  )
  const canManage =
    account.status === 'ready' &&
    ['owner', 'admin'].includes(account.membership.role)
  const hasSubscription = Boolean(
    subscription && manageableSubscriptionStatuses.has(subscription.status),
  )
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
        style: 'currency',
        currency: plans[0]?.currency?.toUpperCase() ?? 'EUR',
      }),
    [i18n.language, i18n.resolvedLanguage, plans],
  )

  async function runAction(planId?: string) {
    if (account.status !== 'ready' || !canManage) return
    const key = hasSubscription ? 'portal' : planId
    if (!key) return
    setActionLoading(key)
    setError(null)
    try {
      const result = hasSubscription
        ? await createCustomerPortalSession(account.account.id)
        : await createCheckoutSession(account.account.id, planId!)
      if (!hasSubscription && planId) {
        const plan = plans.find((candidate) => candidate.id === planId)
        if (plan) {
          trackAnalyticsEvent('begin_checkout', {
            currency: plan.currency.toUpperCase(),
            value: plan.price_cents / 100,
            plan_code: plan.code,
            billing_interval: plan.interval,
          })
        }
      }
      setRedirectUrl(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setActionLoading(null)
    }
  }

  function features(plan: CreditPlan) {
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
          : [
              t(`features.${key}`, {
                value: credits[key],
                period: t(
                  plan.interval === 'year'
                    ? 'creditPeriod.annual'
                    : 'creditPeriod.monthly',
                ),
              }),
            ],
      ),
    ]
  }

  if (account.status === 'loading' || status === 'loading')
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (status === 'error' || account.status !== 'ready')
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-medium">{t('errorLoading')}</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    )

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(
        i18n.resolvedLanguage ?? i18n.language,
      )
    : null
  const notice =
    searchParams.get('success') === '1'
      ? 'checkoutSuccess'
      : searchParams.get('canceled') === '1'
        ? 'checkoutCanceled'
        : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </div>
      {notice && (
        <div className="bg-muted rounded-lg border p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span>{t(notice)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                searchParams.delete(
                  notice === 'checkoutSuccess' ? 'success' : 'canceled',
                )
                setSearchParams(searchParams, { replace: true })
              }}
            >
              {t('dismiss')}
            </Button>
          </div>
        </div>
      )}
      {subscription && (
        <div
          className={`rounded-lg border p-4 text-sm ${['past_due', 'unpaid', 'incomplete'].includes(subscription.status) ? 'border-red-300 bg-red-50 text-red-900' : 'bg-muted'}`}
        >
          <p className="font-medium">{t(`status.${subscription.status}`)}</p>
          <p className="mt-1">
            {subscription.cancel_at_period_end
              ? t('cancelAtPeriodEnd', { date: periodEnd })
              : periodEnd
                ? t('renewsAt', { date: periodEnd })
                : t('statusDescription')}
          </p>
          {canManage && hasSubscription && (
            <Button
              className="mt-3"
              variant="outline"
              isLoading={actionLoading === 'portal'}
              onClick={() => runAction()}
            >
              {t('manageSubscription')}
            </Button>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('credits')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {credits.reduce((sum, c) => sum + c.balance, 0)}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('plan')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {currentPlan?.name ?? t('freePlan')}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            {t('invoices')}
          </CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {payments.length}
          </CardDescription>
        </Card>
      </div>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-foreground text-lg font-semibold">
            {t('plans')}
          </h2>
          <div className="flex rounded-lg border p-1">
            <Button
              size="sm"
              variant={interval === 'month' ? 'default' : 'ghost'}
              onClick={() => setInterval('month')}
            >
              {t('billingMonthly')}
            </Button>
            <Button
              size="sm"
              variant={interval === 'year' ? 'default' : 'ghost'}
              onClick={() => setInterval('year')}
            >
              {t('billingYearly')}
            </Button>
          </div>
        </div>
        {interval === 'year' && (
          <p className="text-muted-foreground mb-3 text-sm">
            {t('annualCreditsExplanation')}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlans.map((plan) => {
            const isCurrent = plan.id === currentPlan?.id
            const selected = plan.code === selectedPlanCode
            const purchasable =
              plan.price_cents > 0 && Boolean(plan.stripe_price_id)
            return (
              <Card
                key={plan.id}
                className={isCurrent || selected ? 'border-primary' : ''}
              >
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="mt-2">
                  {formatter.format(plan.price_cents / 100)}/
                  {t(`interval.${plan.interval}`)}
                </CardDescription>
                <ul className="text-muted-foreground mt-4 space-y-1 text-sm">
                  {features(plan).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {!canManage && (
                  <p className="text-muted-foreground mt-4 text-sm">
                    {t('ownerAdminOnly')}
                  </p>
                )}
                <Button
                  className="mt-4 w-full"
                  variant={isCurrent || plan.is_default ? 'outline' : 'default'}
                  isLoading={
                    actionLoading === (hasSubscription ? 'portal' : plan.id)
                  }
                  disabled={
                    !canManage ||
                    (!hasSubscription &&
                      (!purchasable || isCurrent || plan.is_default))
                  }
                  onClick={() => runAction(plan.id)}
                >
                  {hasSubscription && !isCurrent
                    ? t('changeInPortal')
                    : isCurrent || plan.is_default
                      ? t('currentPlan')
                      : t('subscribe')}
                </Button>
              </Card>
            )
          })}
        </div>
      </section>
      {usage.length > 0 && (
        <section>
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
        </section>
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
