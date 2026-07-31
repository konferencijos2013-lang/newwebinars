import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  Bot,
  FileText,
  Mail,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { useUser } from '@/features/auth/hooks/useUser'
import { sendMessage } from '@/features/ai/api/ai'

const scopes = [
  {
    key: 'email',
    icon: Mail,
    prompt:
      'Write a marketing email for a webinar. Include a hook, value, date, and CTA.',
  },
  {
    key: 'storytelling',
    icon: Sparkles,
    prompt: `Story Vault details:
- Character(s):
- Context (what, where, when, how):
- Conflict/challenge:
- Emotional stakes and sensory details:
- Resolution/lesson:
- Offer or desired call to action:`,
  },
  {
    key: 'slides',
    icon: FileText,
    prompt: `Product name:
Target audience:
Core problem/pain:
Primary benefit/outcome:
Price and anchors (for example, 10,000 -> 4,995):
Bonuses:
Guarantee:`,
  },
  {
    key: 'chat_script',
    icon: MessageSquare,
    prompt:
      'Create a simulated evergreen webinar chat script with 5 messages and timestamps.',
  },
]

export function AiDashboardPage() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const account = useAccount()
  const { user } = useUser()
  const [mode, setMode] = useState<string>('email')
  const [input, setInput] = useState(() => {
    const defaultScope = scopes.find((s) => s.key === 'email')
    return defaultScope?.prompt ?? ''
  })
  const [reply, setReply] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isAdmin = user?.role === 'admin'
  const isReady = account.status === 'ready'

  async function handleGenerate() {
    if (!input.trim() || !isReady) return
    setLoading(true)
    setReply(null)
    try {
      const data = await sendMessage({
        thread_id: 'dash-' + Date.now(),
        account_id: account.account.id,
        content: input,
        scope: mode,
        previousMessages: [],
      })
      setReply(data.content)
    } catch (err) {
      setReply(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {t('dashboard.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('dashboard.subtitle')}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/ai/prompts')}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {t('dashboard.prompts')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {scopes.map((s) => (
          <Card
            key={s.key}
            className="hover:border-primary/50 cursor-pointer transition-colors"
            onClick={() => {
              setMode(s.key)
              setInput(s.prompt)
              setReply(null)
            }}
          >
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <s.icon className="text-primary h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">{t(`modes.${s.key}.title`)}</h3>
                <CardDescription className="mt-1">
                  {t(`modes.${s.key}.description`)}
                </CardDescription>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="border-border bg-background text-foreground focus:ring-primary w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          placeholder={t('dashboard.placeholder')}
        />
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            {t('dashboard.modeLabel')}:{' '}
            <span className="font-medium">{t(`modes.${mode}.title`)}</span>
          </div>
          <Button onClick={handleGenerate} disabled={loading || !input.trim()}>
            {loading ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Bot className="mr-2 h-4 w-4" />
            )}
            {t('dashboard.generate')}
          </Button>
        </div>
      </div>

      {reply ? (
        <div className="space-y-2">
          <h3 className="font-semibold">{t('dashboard.result')}</h3>
          <div className="border-border bg-muted/50 dark:bg-muted/30 rounded-md border p-4 text-sm whitespace-pre-wrap">
            {reply}
          </div>
        </div>
      ) : null}
    </div>
  )
}
