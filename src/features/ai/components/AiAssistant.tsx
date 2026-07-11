import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { sendMessage, fetchMessages, createThread } from '@/features/ai/api/ai'
import type { AiMessage } from '@/shared/database.types'

export function AiAssistant({
  scope,
  scopeId,
  contextPrompt,
}: {
  scope: string
  scopeId?: string | null
  contextPrompt?: string
}) {
  const { t } = useTranslation('ai')
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function ensureThread() {
    if (threadId) return threadId
    if (account.status !== 'ready') throw new Error('Not logged in')

    const thread = await createThread({
      account_id: account.account.id,
      user_id: account.account.owner_id,
      title: contextPrompt ?? t('newChat'),
      scope,
      scope_id: scopeId || null,
    })
    setThreadId(thread.id)
    return thread.id
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || account.status !== 'ready') return
    setLoading(true)
    setError(null)

    try {
      const id = await ensureThread()
      const userContent = input.trim()
      setInput('')

      const previousMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const reply = await sendMessage({
        thread_id: id,
        account_id: account.account.id,
        content: userContent,
        scope,
        scope_id: scopeId || null,
        previousMessages,
      })

      const history = await fetchMessages(id)
      setMessages(history)
      console.log('AI tokens used', reply.tokens_used)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="border-border bg-card flex h-[420px] w-[340px] flex-col rounded-lg border shadow-xl sm:w-[380px]">
          <div className="border-b p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="text-primary h-5 w-5" />
                <span className="font-semibold">{t('title')}</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{t('hint')}</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-center text-sm">
                {t('empty')}
              </p>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-muted'
                }`}
              >
                {m.content}
              </div>
            ))}
            {error ? (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('placeholder')}
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      )}

      <Button
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-12 rounded-full p-0"
        aria-label={t('toggle')}
      >
        <Bot className="h-5 w-5" />
      </Button>
    </div>
  )
}
