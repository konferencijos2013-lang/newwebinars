import { supabase } from '@/lib/supabase'
import type { Account } from '@/shared/database.types'

export type DomainSettingsPatch = Pick<
  Account,
  'public_subdomain' | 'custom_domain' | 'custom_domain_status'
>

export async function updateAccountDomains(
  accountId: string,
  patch: Partial<DomainSettingsPatch>,
) {
  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', accountId)
    .select()
    .single()

  if (error) throw error
  return data as Account
}
