import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { fetchAllPrompts, deletePrompt } from '@/features/ai/api/ai'
import type { AiPrompt } from '@/shared/database.types'

export function AiPromptsPage() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const account = useAccount()
  const [prompts, setPrompts] = useState<AiPrompt[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    if (account.status !== 'ready') return
    let isActive = true
    async function load() {
      try {
        const data = await fetchAllPrompts(account.account!.id)
        if (!isActive) return
        setPrompts(data)
        setStatus('ready')
      } catch {
        if (isActive) setStatus('error')
      }
    }
    load()
    return () => {
      isActive = false
    }
  }, [account.status, account.account?.id, account.account])

  async function handleDelete(id: string) {
    if (!window.confirm(t('prompts.deleteConfirm'))) return
    try {
      await deletePrompt(id)
      setPrompts((prev) => prev.filter((p) => p.id !== id))
    } catch {
      alert(t('prompts.deleteError'))
    }
  }

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="p-6 text-center text-red-600 dark:text-red-400">
        {t('prompts.loadError')}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {t('prompts.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('prompts.subtitle')}
          </p>
        </div>
        <Button onClick={() => navigate('/ai/prompts/new')}>
          <Plus className="mr-2 h-4 w-4" />
          {t('prompts.create')}
        </Button>
      </div>

      {prompts.length === 0 ? (
        <div className="border-border rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">{t('prompts.empty')}</p>
        </div>
      ) : (
        <div className="divide-border divide-y rounded-lg border">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="hover:bg-muted/50 flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold">{prompt.name}</h3>
                  <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
                    {prompt.scope}
                  </span>
                  {prompt.is_active ? null : (
                    <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                      {t('prompts.inactive')}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                  {prompt.system_prompt || t('prompts.noSystem')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/ai/prompts/${prompt.id}`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('prompts.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(prompt.id)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('prompts.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
