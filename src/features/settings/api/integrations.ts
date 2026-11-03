import { supabase } from '@/lib/supabase'

export type IntegrationProvider =
  | 'brevo'
  | 'resend'
  | 'smtp'
  | 'manychat'
  | 'telegram'
  | 'paysera'
  | 'stripe'
  | 'paypal'

export type OfferPaymentProvider = 'paysera' | 'stripe' | 'paypal'
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

export async function fetchAccountPaymentProvider(accountId: string) {
  const { data, error } = await supabase
    .from('account_payment_settings')
    .select('provider')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw error
  return (data?.provider ?? null) as OfferPaymentProvider | null
}

export async function selectAccountPaymentProvider(
  accountId: string,
  provider: OfferPaymentProvider,
) {
  const { error } = await supabase.rpc('set_account_payment_provider', {
    p_account_id: accountId,
    p_provider: provider,
  })
  if (error) throw error
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

export async function updateTelegramAiSettings(input: {
  connectionId: string
  enabled: boolean
  systemPrompt: string
  welcomeMessage: string
  fallbackMessage: string
}) {
  const { data, error } = await supabase.rpc('update_telegram_ai_settings', {
    p_connection_id: input.connectionId,
    p_enabled: input.enabled,
    p_system_prompt: input.systemPrompt,
    p_welcome_message: input.welcomeMessage,
    p_fallback_message: input.fallbackMessage,
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

export async function uploadTelegramBroadcastImage(
  accountId: string,
  file: File,
) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type))
    throw new Error('Pasirinkite JPG, PNG arba WEBP nuotrauką.')
  if (file.size > 10 * 1024 * 1024)
    throw new Error('Nuotrauka negali viršyti 10 MB.')

  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  const path = `${accountId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from('telegram-broadcast-assets')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
  if (error) throw error
  return path
}

export interface TelegramBroadcast {
  id: string
  status: 'scheduled' | 'queued' | 'processing' | 'completed' | 'cancelled'
  recipient_count: number
  sent_count: number
  failed_count: number
  blocked_count: number
  created_at: string
  completed_at: string | null
  scheduled_for: string | null
  started_at: string | null
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
  imagePath?: string | null
  scheduledFor?: string | null
}) {
  const result = await invokeTelegramBroadcast({
    action: 'create',
    connection_id: input.connectionId,
    message: input.message,
    audience: input.audience,
    request_key: input.requestKey,
    image_path: input.imagePath ?? null,
    scheduled_for: input.scheduledFor ?? null,
    contact_ids: input.audience === 'selected' ? input.contactIds : undefined,
  })
  return result.broadcast
}

export async function fetchLatestTelegramBroadcast(connectionId: string) {
  const { data, error } = await supabase
    .from('telegram_broadcasts')
    .select(
      'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at,scheduled_for,started_at',
    )
    .eq('integration_connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TelegramBroadcast | null
}

export async function fetchTelegramBroadcasts(
  connectionId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from('telegram_broadcasts')
    .select(
      'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at,scheduled_for,started_at',
    )
    .eq('integration_connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as TelegramBroadcast[]
}

export async function setTelegramContactStatus(
  contactId: string,
  status: 'active' | 'blocked',
) {
  const { error } = await supabase.rpc('set_telegram_contact_status', {
    p_contact_id: contactId,
    p_status: status,
  })
  if (error) throw error
}

export async function deleteTelegramContact(contactId: string) {
  const { error } = await supabase.rpc('delete_telegram_contact', {
    p_contact_id: contactId,
  })
  if (error) throw error
}

export async function importTelegramContacts(
  connectionId: string,
  rows: Array<{
    chat_id: string
    telegram_user_id?: string
    username?: string
    first_name?: string
    last_name?: string
  }>,
) {
  const { data, error } = await supabase.rpc('import_telegram_contacts', {
    p_connection_id: connectionId,
    p_rows: rows,
  })
  if (error) throw error
  const result = (Array.isArray(data) ? data[0] : data) as
    | {
        inserted_count: number
        updated_count: number
        skipped_count: number
      }
    | undefined
  return {
    inserted: result?.inserted_count ?? 0,
    updated: result?.updated_count ?? 0,
    skipped: result?.skipped_count ?? 0,
  }
}

export async function fetchAllTelegramContacts(
  accountId: string,
  connectionId: string,
) {
  const pageSize = 100
  const contacts: TelegramContact[] = []
  for (let page = 0; page < 50; page += 1) {
    const result = await fetchTelegramContacts({
      accountId,
      connectionId,
      page,
      pageSize,
    })
    contacts.push(...result.contacts)
    if (contacts.length >= result.total || result.contacts.length < pageSize)
      break
  }
  return contacts
}

export async function cancelScheduledTelegramBroadcast(broadcastId: string) {
  const { data, error } = await supabase.rpc(
    'cancel_scheduled_telegram_broadcast',
    { p_broadcast_id: broadcastId },
  )
  if (error) throw error
  if (!data) throw new Error('Suplanuoto siuntimo atšaukti nepavyko.')
}
