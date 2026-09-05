import { supabase } from '@/lib/supabase'

export type IntegrationProvider =
  'brevo' | 'resend' | 'smtp' | 'manychat' | 'telegram'
export type IntegrationStatus = 'active' | 'disabled' | 'error'

export interface IntegrationConnection {
  id: string
  account_id: string
  provider: IntegrationProvider
  display_name: string
  status: IntegrationStatus
  config: Record<string, unknown>
  last_tested_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export async function fetchIntegrationConnections(accountId: string) {
  const { data, error } = await supabase
    .from('integration_connections')
    .select(
      'id,account_id,provider,display_name,status,config,last_tested_at,last_error,created_at,updated_at',
    )
    .eq('account_id', accountId)
    .order('provider')
  if (error) throw error
  return (data ?? []) as IntegrationConnection[]
}

export async function saveIntegrationConnection(input: {
  accountId: string
  provider: IntegrationProvider
  displayName: string
  config: Record<string, unknown>
  credential: string
}) {
  const { data, error } = await supabase.rpc('save_integration_connection', {
    p_account_id: input.accountId,
    p_provider: input.provider,
    p_display_name: input.displayName,
    p_config: input.config,
    p_secret: input.credential,
  })
  if (error) throw error
  return data as IntegrationConnection
}

export async function configureTelegramBot(connectionId: string) {
  const { data, error } = await supabase.functions.invoke(
    'configure-telegram-bot',
    { body: { connection_id: connectionId } },
  )
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as { configured: true; bot_username: string }
}

export interface TelegramContact {
  id: string
  integration_connection_id: string
  chat_id: string
  telegram_user_id: string | null
  username: string | null
  first_name: string | null
  last_name: string | null
  language_code: string | null
  status: 'active' | 'blocked' | 'unsubscribed'
  broadcast_opted_in_at: string | null
  first_seen_at: string
  last_seen_at: string
}

export interface TelegramContactPage {
  contacts: TelegramContact[]
  total: number
  page: number
  pageSize: number
}

export async function fetchTelegramContacts(input: {
  accountId: string
  connectionId: string
  page?: number
  pageSize?: number
  search?: string
  eligibleOnly?: boolean
}): Promise<TelegramContactPage> {
  const page = Math.max(0, input.page ?? 0)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  const from = page * pageSize
  let query = supabase
    .from('telegram_contacts')
    .select(
      'id,integration_connection_id,chat_id,telegram_user_id,username,first_name,last_name,language_code,status,broadcast_opted_in_at,first_seen_at,last_seen_at',
      { count: 'exact' },
    )
    .eq('account_id', input.accountId)
    .eq('integration_connection_id', input.connectionId)

  if (input.eligibleOnly) {
    query = query
      .eq('status', 'active')
      .not('broadcast_opted_in_at', 'is', null)
  }
  const search = (input.search ?? '')
    .trim()
    .replace(/[%_,().]/g, '')
    .slice(0, 100)
  if (search) {
    query = query.or(
      `username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,telegram_user_id.ilike.%${search}%`,
    )
  }
  const { data, error, count } = await query
    .order('last_seen_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return {
    contacts: (data ?? []) as TelegramContact[],
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function fetchTelegramContactCount(
  accountId: string,
  connectionId: string,
) {
  const { count, error } = await supabase
    .from('telegram_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('integration_connection_id', connectionId)
    .eq('status', 'active')
    .not('broadcast_opted_in_at', 'is', null)
  if (error) throw error
  return count ?? 0
}

export interface TelegramBroadcast {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'cancelled'
  recipient_count: number
  sent_count: number
  failed_count: number
  blocked_count: number
  created_at: string
  completed_at: string | null
}

async function invokeTelegramBroadcast(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    'send-telegram-message',
    { body },
  )
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as { broadcast: TelegramBroadcast; processed?: number }
}

export async function createTelegramBroadcast(input: {
  connectionId: string
  message: string
  audience: 'all' | 'selected'
  contactIds?: string[]
  requestKey: string
}) {
  const result = await invokeTelegramBroadcast({
    action: 'create',
    connection_id: input.connectionId,
    message: input.message,
    audience: input.audience,
    request_key: input.requestKey,
    contact_ids: input.audience === 'selected' ? input.contactIds : undefined,
  })
  return result.broadcast
}

export async function fetchLatestTelegramBroadcast(connectionId: string) {
  const { data, error } = await supabase
    .from('telegram_broadcasts')
    .select(
      'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at',
    )
    .eq('integration_connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TelegramBroadcast | null
}
