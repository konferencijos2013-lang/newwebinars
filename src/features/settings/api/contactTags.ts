import { supabase } from '@/lib/supabase'

export interface ContactTag {
  id: string
  name: string
}

export async function fetchContactTags(accountId: string) {
  const { data, error } = await supabase
    .from('contact_tags')
    .select('id,name')
    .eq('account_id', accountId)
    .order('name')
  if (error) throw error
  return (data ?? []) as ContactTag[]
}

export async function createContactTag(accountId: string, name: string) {
  const { data, error } = await supabase.rpc('create_contact_tag', {
    p_account_id: accountId,
    p_name: name,
  })
  if (error) throw error
  return data as ContactTag
}

export async function deleteContactTag(tagId: string) {
  const { error } = await supabase.rpc('delete_contact_tag', {
    p_tag_id: tagId,
  })
  if (error) throw error
}

export async function setContactTag(input: {
  kind: 'email' | 'telegram'
  contactId: string
  tagId: string
  assigned: boolean
}) {
  const { error } = await supabase.rpc('set_contact_tag', {
    p_kind: input.kind,
    p_contact_id: input.contactId,
    p_tag_id: input.tagId,
    p_assigned: input.assigned,
  })
  if (error) throw error
}

export interface TagCondition {
  tagId: string
  present: boolean
}

export type TagMatch = 'all' | 'any'

export function tagConditionsPayload(conditions: TagCondition[] | undefined) {
  if (!conditions?.length) return null
  return conditions.map((item) => ({
    tag_id: item.tagId,
    present: item.present,
  }))
}

export interface TaggedContactPage<T> {
  contacts: T[]
  total: number
  matched: number
}

export async function searchEmailContacts(input: {
  accountId: string
  search?: string
  tagConditions?: TagCondition[]
  tagMatch?: TagMatch
  page?: number
  pageSize?: number
}) {
  const page = Math.max(0, input.page ?? 0)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  const { data, error } = await supabase.rpc('search_email_contacts', {
    p_account_id: input.accountId,
    p_search: input.search ?? '',
    p_tag_conditions: tagConditionsPayload(input.tagConditions),
    p_tag_match: input.tagMatch ?? 'all',
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (error) throw error
  const result = data as {
    total: number
    active: number
    contacts: Array<{ tag_ids: string[] | null }>
  }
  return {
    contacts: (result.contacts ?? []).map((contact) => ({
      ...contact,
      tagIds: contact.tag_ids ?? [],
    })),
    total: result.total ?? 0,
    active: result.active ?? 0,
  }
}

export async function searchTelegramContacts(input: {
  accountId: string
  connectionId: string
  search?: string
  tagConditions?: TagCondition[]
  tagMatch?: TagMatch
  eligibleOnly?: boolean
  page?: number
  pageSize?: number
}) {
  const page = Math.max(0, input.page ?? 0)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  const { data, error } = await supabase.rpc('search_telegram_contacts', {
    p_account_id: input.accountId,
    p_connection_id: input.connectionId,
    p_search: input.search ?? '',
    p_tag_conditions: tagConditionsPayload(input.tagConditions),
    p_tag_match: input.tagMatch ?? 'all',
    p_eligible_only: input.eligibleOnly ?? false,
    p_limit: pageSize,
    p_offset: page * pageSize,
  })
  if (error) throw error
  const result = data as {
    total: number
    eligible: number
    contacts: Array<{ tag_ids: string[] | null }>
  }
  return {
    contacts: (result.contacts ?? []).map((contact) => ({
      ...contact,
      tagIds: contact.tag_ids ?? [],
    })),
    total: result.total ?? 0,
    eligible: result.eligible ?? 0,
  }
}

export async function listEmailBroadcastContactIds(input: {
  accountId: string
  search?: string
  tagConditions?: TagCondition[]
  tagMatch?: TagMatch
}) {
  const { data, error } = await supabase.rpc('list_email_broadcast_contact_ids', {
    p_account_id: input.accountId,
    p_search: input.search ?? '',
    p_tag_conditions: tagConditionsPayload(input.tagConditions),
    p_tag_match: input.tagMatch ?? 'all',
  })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function listTelegramBroadcastContactIds(input: {
  accountId: string
  connectionId: string
  search?: string
  tagConditions?: TagCondition[]
  tagMatch?: TagMatch
}) {
  const { data, error } = await supabase.rpc(
    'list_telegram_broadcast_contact_ids',
    {
      p_account_id: input.accountId,
      p_connection_id: input.connectionId,
      p_search: input.search ?? '',
      p_tag_conditions: tagConditionsPayload(input.tagConditions),
      p_tag_match: input.tagMatch ?? 'all',
    },
  )
  if (error) throw error
  return (data ?? []) as string[]
}
