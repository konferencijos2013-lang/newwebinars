import { supabase } from '@/lib/supabase'
import { searchEmailContacts } from '@/features/settings/api/contactTags'

export interface EmailContact {
  id: string
  email: string
  full_name: string | null
  status: 'active' | 'blocked' | 'unsubscribed'
  source: 'registration' | 'import'
  last_seen_at: string
  tagIds: string[]
}

export interface EmailBroadcast {
  id: string
  status: 'queued' | 'processing' | 'completed'
  recipient_count: number
  sent_count: number
  failed_count: number
  blocked_count: number
  created_at: string
  completed_at: string | null
  subject: string
}

export async function fetchEmailContacts(input: {
  accountId: string
  page?: number
  pageSize?: number
  search?: string
  includeTagIds?: string[]
  excludeTagIds?: string[]
}) {
  const page = Math.max(0, input.page ?? 0)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  const result = await searchEmailContacts({ ...input, page, pageSize })
  return {
    contacts: result.contacts as unknown as EmailContact[],
    total: result.total,
    active: result.active,
    page,
    pageSize,
  }
}

export async function fetchActiveEmailContactCount(accountId: string) {
  const { count, error } = await supabase
    .from('email_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'active')
  if (error) throw error
  return count ?? 0
}

export async function fetchAllEmailContacts(accountId: string) {
  const pageSize = 100
  const contacts: EmailContact[] = []
  for (let page = 0; page < 50; page += 1) {
    const result = await fetchEmailContacts({ accountId, page, pageSize })
    contacts.push(...result.contacts)
    if (contacts.length >= result.total || result.contacts.length < pageSize)
      break
  }
  return contacts
}

export async function setEmailContactStatus(
  contactId: string,
  status: 'active' | 'blocked',
) {
  const { error } = await supabase.rpc('set_email_contact_status', {
    p_contact_id: contactId,
    p_status: status,
  })
  if (error) throw error
}

export async function deleteEmailContact(contactId: string) {
  const { error } = await supabase.rpc('delete_email_contact', {
    p_contact_id: contactId,
  })
  if (error) throw error
}

export async function importEmailContacts(
  accountId: string,
  rows: Array<{ email: string; full_name?: string }>,
) {
  const { data, error } = await supabase.rpc('import_email_contacts', {
    p_account_id: accountId,
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

export async function unsubscribeEmailContact(token: string) {
  const { data, error } = await supabase.rpc('unsubscribe_email_contact', {
    p_token: token,
  })
  if (error) throw error
  return data === true
}

export async function createEmailBroadcast(input: {
  connectionId: string
  subject: string
  message: string
  audience: 'all' | 'selected'
  contactIds?: string[]
  includeTagIds?: string[]
  excludeTagIds?: string[]
  requestKey: string
}) {
  const { data, error } = await supabase.functions.invoke('send-email-broadcast', {
    body: {
      action: 'create',
      connection_id: input.connectionId,
      subject: input.subject,
      message: input.message,
      audience: input.audience,
      request_key: input.requestKey,
      contact_ids: input.audience === 'selected' ? input.contactIds : undefined,
      include_tag_ids:
        input.audience === 'all' ? input.includeTagIds ?? [] : [],
      exclude_tag_ids:
        input.audience === 'all' ? input.excludeTagIds ?? [] : [],
    },
  })
  if (error) {
    let message = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body && typeof body.error === 'string') message = body.error
    } catch {
      message = error.message
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data.broadcast as EmailBroadcast
}

export async function fetchLatestEmailBroadcast(accountId: string) {
  const { data, error } = await supabase
    .from('email_broadcasts')
    .select(
      'id,status,recipient_count,sent_count,failed_count,blocked_count,created_at,completed_at,subject',
    )
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as EmailBroadcast | null
}
