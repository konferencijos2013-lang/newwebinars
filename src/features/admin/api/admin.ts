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
  affiliate_payable_cents: number
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

export type AdminUserRow = Pick<
  Profile,
  'id' | 'email' | 'full_name' | 'role'
> & {
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
    affiliate_payable_cents: 0,
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
  const [
    { data: profiles, error: profilesError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,role')
      .order('email')
      .limit(200),
    supabase.from('account_members').select('user_id,account_id'),
  ])
  if (profilesError) throw profilesError
  if (membershipsError) throw membershipsError

  const accountIds = [
    ...new Set((memberships ?? []).map((member) => member.account_id)),
  ]
  const { data: accounts, error: accountsError } = accountIds.length
    ? await supabase.from('accounts').select('id,name').in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw accountsError
  const accountsById = new Map(
    (accounts ?? []).map((account) => [account.id, account.name]),
  )
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
  const planIds = [
    ...new Set(
      rows.flatMap((item) =>
        item.credit_plan_id ? [item.credit_plan_id] : [],
      ),
    ),
  ]
  const [
    { data: accounts, error: accountsError },
    { data: plans, error: plansError },
  ] = await Promise.all([
    accountIds.length
      ? supabase.from('accounts').select('id,name,slug').in('id', accountIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length
      ? supabase.from('credit_plans').select('id,name').in('id', planIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (accountsError) throw accountsError
  if (plansError) throw plansError
  const accountsById = new Map(
    (accounts ?? []).map((account) => [account.id, account]),
  )
  const plansById = new Map((plans ?? []).map((plan) => [plan.id, plan]))
  return rows.map((item) => ({
    ...item,
    account: accountsById.get(item.account_id) ?? null,
    plan: item.credit_plan_id
      ? (plansById.get(item.credit_plan_id) ?? null)
      : null,
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
    ? await supabase
        .from('accounts')
        .select('id,name,slug')
        .in('id', accountIds)
    : { data: [], error: null }
  if (accountsError) throw accountsError
  const accountsById = new Map(
    (accounts ?? []).map((account) => [account.id, account]),
  )
  return rows.map((item) => ({
    ...item,
    account: accountsById.get(item.account_id) ?? null,
  }))
}

export type AdminPartnerRow = {
  id: string
  name: string
  email: string | null
  code: string
  is_active: boolean
  commission_rate_bps: number
  commission_months: number
  attribution_window_days: number
  payout_hold_days: number
  notes: string | null
  application_status: 'pending' | 'approved' | 'rejected' | 'blocked'
  phone: string | null
  payout_method: 'bank' | 'paypal' | null
  bank_account_holder: string | null
  bank_iban: string | null
  paypal_email: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  submitted_at: string | null
  approved_at: string | null
  created_at: string
  clicks_count: number
  referred_accounts_count: number
  active_subscriptions_count: number
  accrued_cents: number
  payable_cents: number
  paid_cents: number
}

export type AdminPartnerDetail = AdminPartnerRow & {
  attributions: Array<{
    id: string
    account_id: string | null
    attributed_at: string
    status: string
    account: Pick<Account, 'id' | 'name' | 'slug'> | null
    owner: Pick<Profile, 'email' | 'full_name'> | null
    subscription: Pick<Subscription, 'status'> | null
  }>
  commissions: Array<{
    id: string
    amount_cents: number
    currency: string
    status: string
    source_stripe_invoice_id: string
    available_at: string
    created_at: string
    account: Pick<Account, 'id' | 'name'> | null
  }>
  payouts: Array<{
    id: string
    amount_cents: number
    currency: string
    status: string
    payment_reference: string | null
    paid_at: string | null
    created_at: string
  }>
}

function centsByStatus(
  rows: Array<{ amount_cents: number; status: string }>,
  status: string,
) {
  return rows
    .filter((row) => row.status === status)
    .reduce((sum, row) => sum + row.amount_cents, 0)
}

export async function fetchAdminPartners(): Promise<AdminPartnerRow[]> {
  const [
    { data: partners, error: partnersError },
    { data: clicks, error: clicksError },
    { data: attributions, error: attributionsError },
    { data: commissions, error: commissionsError },
    { data: subscriptions, error: subscriptionsError },
  ] = await Promise.all([
    supabase
      .from('partners')
      .select(
        'id,name,email,code,is_active,commission_rate_bps,commission_months,attribution_window_days,payout_hold_days,notes,application_status,phone,payout_method,bank_account_holder,bank_iban,paypal_email,terms_version,terms_accepted_at,submitted_at,approved_at,created_at',
      )
      .eq('type', 'affiliate')
      .order('created_at', { ascending: false }),
    supabase.from('platform_partner_clicks').select('partner_id'),
    supabase
      .from('platform_partner_attributions')
      .select('id,partner_id,account_id'),
    supabase
      .from('affiliate_commissions')
      .select('partner_id,amount_cents,status'),
    supabase.from('subscriptions').select('account_id,status'),
  ])
  if (partnersError) throw partnersError
  if (clicksError) throw clicksError
  if (attributionsError) throw attributionsError
  if (commissionsError) throw commissionsError
  if (subscriptionsError) throw subscriptionsError
  const clicksByPartner = new Map<string, number>()
  for (const click of clicks ?? [])
    clicksByPartner.set(
      click.partner_id,
      (clicksByPartner.get(click.partner_id) ?? 0) + 1,
    )
  const accountsByPartner = new Map<string, string[]>()
  for (const attribution of attributions ?? [])
    if (attribution.account_id)
      accountsByPartner.set(attribution.partner_id, [
        ...(accountsByPartner.get(attribution.partner_id) ?? []),
        attribution.account_id,
      ])
  const activeAccountIds = new Set(
    (subscriptions ?? [])
      .filter((item) => ['active', 'trialing'].includes(item.status))
      .map((item) => item.account_id),
  )
  return (partners ?? []).map((partner) => {
    const partnerCommissions = (commissions ?? []).filter(
      (item) => item.partner_id === partner.id,
    )
    const accountIds = accountsByPartner.get(partner.id) ?? []
    return {
      ...partner,
      clicks_count: clicksByPartner.get(partner.id) ?? 0,
      referred_accounts_count: accountIds.length,
      active_subscriptions_count: accountIds.filter((id) =>
        activeAccountIds.has(id),
      ).length,
      accrued_cents: partnerCommissions
        .filter((item) =>
          ['pending', 'available', 'held'].includes(item.status),
        )
        .reduce((sum, item) => sum + item.amount_cents, 0),
      payable_cents: centsByStatus(partnerCommissions, 'available'),
      paid_cents: centsByStatus(partnerCommissions, 'paid'),
    }
  })
}

export async function fetchAdminPartnerDetail(
  partnerId: string,
): Promise<AdminPartnerDetail> {
  const partners = await fetchAdminPartners()
  const partner = partners.find((item) => item.id === partnerId)
  if (!partner) throw new Error('Partner not found')
  const [
    { data: attributionRows, error: attributionsError },
    { data: commissionRows, error: commissionsError },
    { data: payoutRows, error: payoutsError },
  ] = await Promise.all([
    supabase
      .from('platform_partner_attributions')
      .select('*')
      .eq('partner_id', partnerId)
      .order('attributed_at', { ascending: false }),
    supabase
      .from('affiliate_commissions')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('affiliate_payouts')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false }),
  ])
  if (attributionsError) throw attributionsError
  if (commissionsError) throw commissionsError
  if (payoutsError) throw payoutsError
  const accountIds = [
    ...new Set(
      (attributionRows ?? []).flatMap((row) =>
        row.account_id ? [row.account_id] : [],
      ),
    ),
  ]
  const [
    { data: accounts, error: accountsError },
    { data: subscriptions, error: subscriptionsError },
  ] = await Promise.all([
    accountIds.length
      ? supabase
          .from('accounts')
          .select('id,name,slug,owner_id')
          .in('id', accountIds)
      : Promise.resolve({ data: [], error: null }),
    accountIds.length
      ? supabase
          .from('subscriptions')
          .select('account_id,status')
          .in('account_id', accountIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (accountsError) throw accountsError
  if (subscriptionsError) throw subscriptionsError
  const ownerIds = [
    ...new Set((accounts ?? []).map((account) => account.owner_id)),
  ]
  const { data: owners, error: ownersError } = ownerIds.length
    ? await supabase
        .from('profiles')
        .select('id,email,full_name')
        .in('id', ownerIds)
    : { data: [], error: null }
  if (ownersError) throw ownersError
  const accountsById = new Map(
    (accounts ?? []).map((account) => [account.id, account]),
  )
  const ownersById = new Map((owners ?? []).map((owner) => [owner.id, owner]))
  const subscriptionsByAccount = new Map(
    (subscriptions ?? []).map((subscription) => [
      subscription.account_id,
      subscription,
    ]),
  )
  return {
    ...partner,
    attributions: (attributionRows ?? []).map((row) => {
      const account = row.account_id ? accountsById.get(row.account_id) : null
      return {
        id: row.id,
        account_id: row.account_id,
        attributed_at: row.attributed_at,
        status: row.status,
        account: account
          ? { id: account.id, name: account.name, slug: account.slug }
          : null,
        owner: account ? (ownersById.get(account.owner_id) ?? null) : null,
        subscription: row.account_id
          ? (subscriptionsByAccount.get(row.account_id) ?? null)
          : null,
      }
    }),
    commissions: (commissionRows ?? []).map((row) => ({
      id: row.id,
      amount_cents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      source_stripe_invoice_id: row.source_stripe_invoice_id,
      available_at: row.available_at,
      created_at: row.created_at,
      account: accountsById.get(row.account_id)
        ? { id: row.account_id, name: accountsById.get(row.account_id)!.name }
        : null,
    })),
    payouts: (payoutRows ?? []) as AdminPartnerDetail['payouts'],
  }
}

export type AdminPartnerInput = {
  id?: string
  name: string
  email: string | null
  code: string
  is_active: boolean
  commission_rate_bps: number
  commission_months: number
  attribution_window_days: number
  payout_hold_days: number
  notes: string | null
}

export async function saveAdminPartner(input: AdminPartnerInput) {
  const { data, error } = await supabase.rpc('upsert_platform_partner', {
    p_partner_id: input.id ?? null,
    p_name: input.name,
    p_email: input.email,
    p_code: input.code,
    p_is_active: input.is_active,
    p_commission_rate_bps: input.commission_rate_bps,
    p_commission_months: input.commission_months,
    p_attribution_window_days: input.attribution_window_days,
    p_payout_hold_days: input.payout_hold_days,
    p_notes: input.notes,
  })
  if (error) throw error
  return data as string
}

export async function createAffiliatePayout(
  partnerId: string,
  commissionIds: string[],
  reference: string,
  notes: string,
) {
  const { data, error } = await supabase.rpc('create_affiliate_payout', {
    p_partner_id: partnerId,
    p_commission_ids: commissionIds,
    p_payment_reference: reference || null,
    p_notes: notes || null,
  })
  if (error) throw error
  return data as string
}

export async function markAffiliatePayoutPaid(
  payoutId: string,
  reference: string,
) {
  const { error } = await supabase.rpc('mark_affiliate_payout_paid', {
    p_payout_id: payoutId,
    p_payment_reference: reference || null,
  })
  if (error) throw error
}

export async function approvePartnerApplication(partnerId: string) {
  const { error } = await supabase.rpc('approve_partner_application', {
    p_partner_id: partnerId,
  })
  if (error) throw error
}

export async function setPartnerApplicationStatus(
  partnerId: string,
  status: 'rejected' | 'blocked',
) {
  const { error } = await supabase.rpc('set_partner_application_status', {
    p_partner_id: partnerId,
    p_status: status,
  })
  if (error) throw error
}
