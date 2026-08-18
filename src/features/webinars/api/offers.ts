import { supabase } from '@/lib/supabase'
import type { WebinarOffer } from '@/shared/database.types'

export type CtaEvent = {
  id: string
  webinar_id: string
  trigger_seconds: number
  action: 'show' | 'hide'
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export type CtaLiveState = {
  webinar_id: string
  is_visible: boolean
  changed_at: string
  changed_by: string | null
}

export async function fetchOffer(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_offers')
    .select('*')
    .eq('webinar_id', webinarId)
    .maybeSingle()
  if (error) throw error
  return data as WebinarOffer | null
}
export async function saveOffer(
  input: Pick<
    WebinarOffer,
    | 'webinar_id'
    | 'title'
    | 'description'
    | 'button_text'
    | 'target_url'
    | 'active'
  >,
) {
  const { data, error } = await supabase
    .from('webinar_offers')
    .upsert(input, { onConflict: 'webinar_id' })
    .select()
    .single()
  if (error) throw error
  return data as WebinarOffer
}
export async function fetchCtaEvents(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_cta_script_events')
    .select('*')
    .eq('webinar_id', webinarId)
    .eq('is_active', true)
    .order('trigger_seconds')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CtaEvent[]
}
export async function fetchCtaEventsForEditor(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_cta_script_events')
    .select('*')
    .eq('webinar_id', webinarId)
    .order('trigger_seconds')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CtaEvent[]
}
export async function createCtaEvent(
  input: Pick<
    CtaEvent,
    'webinar_id' | 'trigger_seconds' | 'action' | 'sort_order'
  >,
) {
  const { data, error } = await supabase
    .from('webinar_cta_script_events')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as CtaEvent
}
export async function deleteCtaEvent(id: string) {
  const { error } = await supabase
    .from('webinar_cta_script_events')
    .delete()
    .eq('id', id)
  if (error) throw error
}
export async function updateCtaEvent(
  id: string,
  patch: Partial<Pick<CtaEvent, 'trigger_seconds' | 'action' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('webinar_cta_script_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CtaEvent
}
export async function getLiveCtaState(webinarId: string) {
  const { data, error } = await supabase
    .from('webinar_cta_live_state')
    .select('*')
    .eq('webinar_id', webinarId)
    .maybeSingle()
  if (error) throw error
  return data as CtaLiveState | null
}
export async function setLiveCtaVisibility(
  webinarId: string,
  isVisible: boolean,
) {
  const { data, error } = await supabase.rpc(
    'set_webinar_cta_live_visibility',
    { p_webinar_id: webinarId, p_is_visible: isVisible },
  )
  if (error) throw error
  return data as CtaLiveState
}
