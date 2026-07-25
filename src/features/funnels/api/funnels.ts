import { supabase } from '@/lib/supabase'
import type { Funnel, FunnelPage, FunnelBlock } from '@/shared/database.types'

export type CreateFunnelInput = {
  account_id: string
  name: string
  slug: string
  webinar_id?: string | null
}

export async function fetchFunnels(accountId: string) {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Funnel[]
}

export async function fetchFunnel(id: string) {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Funnel
}

export async function createFunnel(input: CreateFunnelInput) {
  const { data, error } = await supabase
    .from('funnels')
    .insert({ ...input, status: 'draft' })
    .select()
    .single()
  if (error) throw error
  return data as Funnel
}

export async function updateFunnel(id: string, patch: Partial<Funnel>) {
  const { data, error } = await supabase
    .from('funnels')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Funnel
}

export async function deleteFunnel(id: string) {
  const { error } = await supabase.from('funnels').delete().eq('id', id)
  if (error) throw error
}

// Funnel flow order (registration -> waiting room -> webinar room -> offer),
// not alphabetical — sorting by `path` put "Offer" before "Registration".
const STEP_TYPE_ORDER: Record<string, number> = {
  registration: 0,
  waiting_room: 1,
  webinar_room: 2,
  offer: 3,
  order_form: 4,
  thank_you: 5,
  lead_magnet: 6,
}

export async function fetchFunnelPages(funnelId: string) {
  const { data, error } = await supabase
    .from('funnel_pages')
    .select('*')
    .eq('funnel_id', funnelId)

  if (error) throw error
  const pages = (data ?? []) as FunnelPage[]
  return pages.sort(
    (a, b) =>
      (STEP_TYPE_ORDER[a.step_type] ?? 99) -
      (STEP_TYPE_ORDER[b.step_type] ?? 99),
  )
}

export async function createDefaultPages(
  funnelId: string,
  webinarId: string | null,
) {
  const pages = [
    {
      funnel_id: funnelId,
      name: 'Registration',
      step_type: 'registration',
      path: 'registration',
      is_default: true,
    },
    {
      funnel_id: funnelId,
      name: 'Waiting room',
      step_type: webinarId ? 'waiting_room' : 'registration',
      path: 'waiting-room',
      is_default: false,
    },
    {
      funnel_id: funnelId,
      name: 'Webinar room',
      step_type: 'webinar_room',
      path: 'room',
      is_default: false,
    },
    {
      funnel_id: funnelId,
      name: 'Offer',
      step_type: 'offer',
      path: 'offer',
      is_default: false,
    },
  ]

  const { data, error } = await supabase
    .from('funnel_pages')
    .insert(pages)
    .select()

  if (error) throw error
  return (data ?? []) as FunnelPage[]
}

export async function fetchFunnelBlocks(pageId: string) {
  const { data, error } = await supabase
    .from('funnel_blocks')
    .select('*')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as FunnelBlock[]
}

export async function upsertBlock(
  block: Partial<FunnelBlock> & { page_id: string; block_type: string },
) {
  const { data, error } = await supabase
    .from('funnel_blocks')
    .upsert(block)
    .select()
    .single()
  if (error) throw error
  return data as FunnelBlock
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from('funnel_blocks').delete().eq('id', id)
  if (error) throw error
}
