import { supabase } from '@/lib/supabase'

export type IntegrationProvider = 'brevo' | 'resend' | 'smtp' | 'manychat'
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
    .select('id,account_id,provider,display_name,status,config,last_tested_at,last_error,created_at,updated_at')
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
