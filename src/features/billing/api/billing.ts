import { supabase } from '@/lib/supabase'
import type {
  CreditPlan,
  AccountCredit,
  UsageEvent,
  BillingCustomer,
  Subscription,
  Payment,
} from '@/shared/database.types'

export async function fetchCreditPlans() {
  const { data, error } = await supabase
    .from('credit_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true })

  if (error) throw error
  return (data ?? []) as CreditPlan[]
}

export async function fetchAccountCredits(accountId: string) {
  const { data, error } = await supabase
    .from('account_credits')
    .select('*')
    .eq('account_id', accountId)

  if (error) throw error
  return (data ?? []) as AccountCredit[]
}

export async function fetchUsageEvents(accountId: string, limit = 50) {
  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as UsageEvent[]
}

export async function fetchBillingCustomer(accountId: string) {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('*')
    .eq('account_id', accountId)
    .single()

  if (error) throw error
  return data as BillingCustomer
}

export async function fetchSubscription(accountId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Subscription | null
}

export async function fetchPayments(accountId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Payment[]
}

export async function createCheckoutSession(accountId: string, planId: string) {
  const successUrl = `${window.location.origin}/billing?success=1`
  const cancelUrl = `${window.location.origin}/billing?canceled=1`

  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    {
      body: {
        account_id: accountId,
        plan_id: planId,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  )

  if (error) throw error
  return data as { url: string }
}
