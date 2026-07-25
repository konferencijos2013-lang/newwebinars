import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  createThread,
  fetchMessages,
  fetchThreads,
  sendMessage,
} from '@/features/ai/api/ai'
import type { AiMessage, AiThread } from '@/shared/database.types'

type Message = { role: 'user' | 'assistant'; content: string }

export function AiChatPage() {
  const { t } = useTranslation('ai')
  const account = useAccount()
  const [threads, setThreads] = useState<AiThread[]>([])
  const [activeThread, setActiveThread] = useState<AiThread | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (account.status !== 'ready') return
    fetchThreads(account.account.id).then((data) => {
      setThreads(data)
      if (data.length > 0) {
        setActiveThread(data[0])
      }
    })
  }, [account.status, account.account?.id, account.account])

  useEffect(() => {
    if (!activeThread) return
    fetchMessages(activeThread.id).then((data) => setMessages(data))
  }, [activeThread])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || account.status !== 'ready') return
    setSending(true)

    try {
      let thread: AiThread | null = activeThread
      if (!thread) {
        thread = await createThread({
          account_id: account.account.id,
          user_id: account.account.owner_id,
          title: input.slice(0, 80),
          scope: 'global',
        })
        const newThread = thread
        setActiveThread(newThread)
        setThreads((prev) => [newThread, ...prev])
      }

      const previousMessages: Message[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

      await sendMessage({
        thread_id: thread.id,
        account_id: account.account.id,
        content: input.trim(),
        scope: thread.scope,
        previousMessages,
      })

      const history = await fetchMessages(thread.id)
      setMessages(history)
      setThreads((prev) =>
        prev.map((th) =>
          th.id === thread.id
            ? { ...th, updated_at: new Date().toISOString() }
            : th,
        ),
      )
      setInput('')
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [
        ...prev,
        {
          id: 'err',
          thread_id: activeThread?.id ?? '',
          role: 'assistant',
          content: text,
          created_at: new Date().toISOString(),
        } as AiMessage,
      ])
    } finally {
      setSending(false)
    }
  }

  if (account.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-6xl gap-4 overflow-hidden">
      <aside className="border-border bg-card w-64 shrink-0 rounded-l-lg border">
        <div className="border-b p-3">
          <h3 className="font-semibold">{t('chat.history')}</h3>
        </div>
        <div className="divide-y">
          {threads.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {t('chat.noThreads')}
            </p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveThread(thread)}
                className={`w-full p-3 text-left text-sm transition-colors ${
                  activeThread?.id === thread.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <p className="truncate font-medium">{thread.title}</p>
                <p className="text-xs opacity-80">
                  {new Date(thread.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="border-border bg-card flex flex-1 flex-col rounded-r-lg border">
        <div className="border-b p-4">
          <h2 className="font-semibold">
            {activeThread?.title ?? t('chat.title')}
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">
              {t('chat.empty')}
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              {sending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
