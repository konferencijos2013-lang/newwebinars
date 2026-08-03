import { supabase } from '@/lib/supabase'
import type {
  Account,
  AccountMember,
  Payment,
  Profile,
  Subscription,
  UsageEvent,
  CreditPlan,
} from '@/shared/database.types'

export type AdminOverview = {
  accounts_count: number
  users_count: number
  paid_subscriptions_count: number
  past_due_subscriptions_count: number
  payments_cents: number
}

export type AdminAccountRow = Account & {
  owner: Pick<Profile, 'id' | 'email' | 'full_name'> | null
  members_count: number
  subscription: Subscription | null
}

export type AdminAccountDetail = {
  account: Account
  owner: Pick<Profile, 'id' | 'email' | 'full_name'> | null
  members: Array<
    AccountMember & {
      profile: Pick<Profile, 'id' | 'email' | 'full_name'> | null
    }
  >
  subscription: Subscription | null
  payments: Payment[]
  usage: UsageEvent[]
}

export type AdminUserRow = Pick<Profile, 'id' | 'email' | 'full_name' | 'role'> & {
  accounts_count: number
  account_names: string[]
}

export type AdminSubscriptionRow = Subscription & {
  account: Pick<Account, 'id' | 'name' | 'slug'> | null
  plan: Pick<CreditPlan, 'id' | 'name'> | null
}

export type AdminPaymentRow = Payment & {
  account: Pick<Account, 'id' | 'name' | 'slug'> | null
}

export async function fetchAdminOverview() {
  const { data, error } = await supabase.rpc('get_platform_admin_overview')
  if (error) throw error
  return (data?.[0] ?? {
    accounts_count: 0,
    users_count: 0,
    paid_subscriptions_count: 0,
    past_due_subscriptions_count: 0,
    payments_cents: 0,
  }) as AdminOverview
}

export async function fetchAdminAccounts(
  search = '',
): Promise<AdminAccountRow[]> {
  let query = supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (search.trim()) {
    const value = `%${search.trim()}%`
    query = query.or(`name.ilike.${value},slug.ilike.${value}`)
  }
  const { data: accounts, error } = await query
  if (error) throw error

  const accountRows = (accounts ?? []) as Account[]
  if (!accountRows.length) return []
  const accountIds = accountRows.map((account) => account.id)
  const ownerIds = accountRows.map((account) => account.owner_id)

  const [
    { data: owners, error: ownersError },
    { data: members, error: membersError },
    { data: subscriptions, error: subscriptionsError },
  ] = await Promise.all([
    supabase.from('profiles').select('id,email,full_name').in('id', ownerIds),
    supabase
      .from('account_members')
      .select('account_id')
      .in('account_id', accountIds),
    supabase
      .from('subscriptions')
      .select('*')
      .in('account_id', accountIds)
      .order('created_at', { ascending: false }),
  ])
  if (ownersError) throw ownersError
  if (membersError) throw membersError
  if (subscriptionsError) throw subscriptionsError

  const ownersById = new Map((owners ?? []).map((owner) => [owner.id, owner]))
  const memberCounts = new Map<string, number>()
  for (const member of members ?? [])
    memberCounts.set(
      member.account_id,
      (memberCounts.get(member.account_id) ?? 0) + 1,
    )
  const subscriptionByAccount = new Map<string, Subscription>()
  for (const subscription of (subscriptions ?? []) as Subscription[]) {
    if (!subscriptionByAccount.has(subscription.account_id))
      subscriptionByAccount.set(subscription.account_id, subscription)
  }

  return accountRows.map((account) => ({
    ...account,
    owner: ownersById.get(account.owner_id) ?? null,
    members_count: memberCounts.get(account.id) ?? 0,
    subscription: subscriptionByAccount.get(account.id) ?? null,
  }))
}

export async function fetchAdminAccountDetail(
  accountId: string,
): Promise<AdminAccountDetail> {
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single()
  if (accountError) throw accountError

  const [
    { data: owner, error: ownerError },
    { data: rawMembers, error: membersError },
    { data: subscriptions, error: subscriptionsError },
    { data: payments, error: paymentsError },
    { data: usage, error: usageError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name')
      .eq('id', account.owner_id)
      .single(),
    supabase
      .from('account_members')
      .select('*')
      .eq('account_id', accountId)
      .order('joined_at'),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('payments')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('usage_events')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  if (ownerError && ownerError.code !== 'PGRST116') throw ownerError
  if (membersError) throw membersError
  if (subscriptionsError) throw subscriptionsError
  if (paymentsError) throw paymentsError
  if (usageError) throw usageError

  const memberIds = (rawMembers ?? []).map((member) => member.user_id)
  const { data: memberProfiles, error: profilesError } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id,email,full_name')
        .in('id', memberIds)
    : { data: [], error: null }
  if (profilesError) throw profilesError
  const profilesById = new Map(
    (memberProfiles ?? []).map((profile) => [profile.id, profile]),
  )

  return {
    account: account as Account,
    owner: owner ?? null,
    members: ((rawMembers ?? []) as AccountMember[]).map((member) => ({
      ...member,
      profile: profilesById.get(member.user_id) ?? null,
    })),
    subscription: ((subscriptions ?? [])[0] ?? null) as Subscription | null,
    payments: (payments ?? []) as Payment[],
    usage: (usage ?? []) as UsageEvent[],
  }
}


export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const [{ data: profiles, error: profilesError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      supabase.from('profiles').select('id,email,full_name,role').order('email').limit(200),
      supabase.from('account_members').select('user_id,account_id'),
    ])
  if (profilesError) throw profilesError
  if (membershipsError) throw membershipsError

  const accountIds = [...new Set((memberships ?? []).map((member) => member.account_id))]
  const { data: accounts, error: accountsError } = accountIds.length
    ? await supabase.from('accounts').select('id,name').in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw accountsError
  const accountsById = new Map((accounts ?? []).map((account) => [account.id, account.name]))
  const accountNamesByUser = new Map<string, string[]>()
  for (const membership of memberships ?? []) {
    const name = accountsById.get(membership.account_id)
    if (name)
      accountNamesByUser.set(membership.user_id, [
        ...(accountNamesByUser.get(membership.user_id) ?? []),
        name,
      ])
  }
  return (profiles ?? []).map((profile) => ({
    ...profile,
    accounts_count: accountNamesByUser.get(profile.id)?.length ?? 0,
    account_names: accountNamesByUser.get(profile.id) ?? [],
  }))
}

export async function fetchAdminSubscriptions(
  status: 'active' | 'past_due',
): Promise<AdminSubscriptionRow[]> {
  const statuses = status === 'active' ? ['active', 'trialing'] : ['past_due']
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('*')
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throw error
  const rows = (subscriptions ?? []) as Subscription[]
  const accountIds = [...new Set(rows.map((item) => item.account_id))]
  const planIds = [...new Set(rows.flatMap((item) => (item.credit_plan_id ? [item.credit_plan_id] : [])))]
  const [{ data: accounts, error: accountsError }, { data: plans, error: plansError }] = await Promise.all([
    accountIds.length ? supabase.from('accounts').select('id,name,slug').in('id', accountIds) : Promise.resolve({ data: [], error: null }),
    planIds.length ? supabase.from('credit_plans').select('id,name').in('id', planIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (accountsError) throw accountsError
  if (plansError) throw plansError
  const accountsById = new Map((accounts ?? []).map((account) => [account.id, account]))
  const plansById = new Map((plans ?? []).map((plan) => [plan.id, plan]))
  return rows.map((item) => ({
    ...item,
    account: accountsById.get(item.account_id) ?? null,
    plan: item.credit_plan_id ? (plansById.get(item.credit_plan_id) ?? null) : null,
  }))
}

export async function fetchAdminPayments(): Promise<AdminPaymentRow[]> {
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  const rows = (payments ?? []) as Payment[]
  const accountIds = [...new Set(rows.map((item) => item.account_id))]
  const { data: accounts, error: accountsError } = accountIds.length
    ? await supabase.from('accounts').select('id,name,slug').in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw accountsError
  const accountsById = new Map((accounts ?? []).map((account) => [account.id, account]))
  return rows.map((item) => ({ ...item, account: accountsById.get(item.account_id) ?? null }))
}
