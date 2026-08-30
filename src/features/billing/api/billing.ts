import { supabase } from '@/lib/supabase'
import { FunctionsHttpError } from '@supabase/supabase-js'
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
    .eq('is_current', true)
    .in('status', [
      'active',
      'trialing',
      'past_due',
      'incomplete',
      'paused',
      'unpaid',
    ])
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

async function describeFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      return new Error(body?.error ?? error.message)
    } catch {
      return new Error(error.message)
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

function createCheckoutAttemptId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
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
        checkout_attempt_id: createCheckoutAttemptId(),
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  )

  if (error) throw await describeFunctionError(error)
  return data as { url: string }
}

export async function createCustomerPortalSession(accountId: string) {
  const { data, error } = await supabase.functions.invoke(
    'create-customer-portal-session',
    {
      body: {
        account_id: accountId,
        return_url: `${window.location.origin}/billing`,
      },
    },
  )

  if (error) throw await describeFunctionError(error)
  return data as { url: string }
}
