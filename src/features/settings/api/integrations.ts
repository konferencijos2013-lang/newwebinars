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
  first_seen_at: string
  last_seen_at: string
}

export async function fetchTelegramContacts(accountId: string) {
  const { data, error } = await supabase
    .from('telegram_contacts')
    .select(
      'id,integration_connection_id,chat_id,telegram_user_id,username,first_name,last_name,language_code,status,first_seen_at,last_seen_at',
    )
    .eq('account_id', accountId)
    .order('last_seen_at', { ascending: false })
    .limit(25)
  if (error) throw error
  return (data ?? []) as TelegramContact[]
}
