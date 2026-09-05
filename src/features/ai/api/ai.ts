import { supabase } from '@/lib/supabase'
import type { AiPrompt, AiThread, AiMessage } from '@/shared/database.types'

export type PromptInput = {
  account_id: string | null
  scope: string
  name: string
  system_prompt: string
  user_prompt_template: string
  is_active?: boolean
}

export async function fetchPrompts(accountId: string, scope?: string) {
  let query = supabase
    .from('ai_prompts')
    .select('*')
    .eq('is_active', true)
    .or(`account_id.eq.${accountId},account_id.is.null`)

  if (scope) {
    query = query.eq('scope', scope)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AiPrompt[]
}

export async function fetchAllPrompts(accountId: string, scope?: string) {
  let query = supabase
    .from('ai_prompts')
    .select('*')
    .or(`account_id.eq.${accountId},account_id.is.null`)

  if (scope) {
    query = query.eq('scope', scope)
  }

  const { data, error } = await query.order('scope').order('name')
  if (error) throw error
  return (data ?? []) as AiPrompt[]
}

export async function fetchPrompt(id: string) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as AiPrompt
}

export async function createPrompt(input: PromptInput) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as AiPrompt
}

export async function updatePrompt(id: string, input: Partial<PromptInput>) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as AiPrompt
}

export async function deletePrompt(id: string) {
  const { error } = await supabase.from('ai_prompts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchThread(threadId: string) {
  const { data, error } = await supabase
    .from('ai_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  if (error) throw error
  return data as AiThread
}

export async function fetchThreads(accountId: string) {
  const { data, error } = await supabase
    .from('ai_threads')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as AiThread[]
}

export async function createThread(input: {
  account_id: string
  user_id: string
  title: string
  scope: string
  scope_id?: string | null
}) {
  const { data, error } = await supabase
    .from('ai_threads')
    .insert(input)
    .select()
    .single()

  if (error) throw error
  return data as AiThread
}

export async function fetchMessages(threadId: string) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as AiMessage[]
}

export async function sendMessage(input: {
  thread_id: string
  account_id: string
  content: string
  scope: string
  scope_id?: string | null
  previousMessages: Array<{ role: string; content: string }>
  generation_mode?: string
  context_prompt?: string
}) {
  const { content, thread_id } = input

  // Persist user message first.
  const { error: persistError } = await supabase.from('ai_messages').insert({
    thread_id,
    role: 'user',
    content,
  })
  if (persistError) throw persistError

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      thread_id,
      account_id: input.account_id,
      scope: input.scope,
      scope_id: input.scope_id,
      generation_mode: input.generation_mode,
      context_prompt: input.context_prompt,
      messages: [...input.previousMessages, { role: 'user', content }],
    },
  })

  if (error) throw error
  return data as { content: string; tokens_used: number | null }
}
