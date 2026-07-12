import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { createPrompt, updatePrompt, fetchPrompt } from '@/features/ai/api/ai'
import type { AiPromptScope } from '@/shared/database.types'

const scopes: AiPromptScope[] = [
  'global',
  'webinar',
  'funnel',
  'chat_script',
  'support',
]

export function AiPromptFormPage() {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const account = useAccount()
  const isEdit = Boolean(id)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(() => (isEdit ? 'loading' : 'ready'))
  const [form, setForm] = useState({
    name: '',
    scope: 'global' as AiPromptScope,
    system_prompt: '',
    user_prompt_template: '',
    is_active: true,
  })

  useEffect(() => {
    if (!isEdit || !id) return
    let isActive = true
    async function load() {
      try {
        const data = await fetchPrompt(id!)
        if (!isActive) return
        setForm({
          name: data.name,
          scope: data.scope,
          system_prompt: data.system_prompt ?? '',
          user_prompt_template: data.user_prompt_template ?? '',
          is_active: data.is_active,
        })
      } finally {
        if (isActive) setStatus('ready')
      }
    }
    load()
    return () => {
      isActive = false
    }
  }, [id, isEdit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (account.status !== 'ready') return
    setSaving(true)
    try {
      const input = {
        ...form,
        account_id: account.account.id,
      }
      if (isEdit && id) {
        await updatePrompt(id, input)
      } else {
        await createPrompt(input)
      }
      navigate('/ai/prompts')
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {isEdit ? t('prompts.editTitle') : t('prompts.createTitle')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('prompts.formSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{t('prompts.nameLabel')}</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scope">{t('prompts.scopeLabel')}</Label>
          <Select
            id="scope"
            value={form.scope}
            onChange={(e) =>
              setForm((f) => ({ ...f, scope: e.target.value as AiPromptScope }))
            }
          >
            {scopes.map((s) => (
              <option key={s} value={s}>
                {t(`scopes.${s}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="system_prompt">{t('prompts.systemLabel')}</Label>
          <textarea
            id="system_prompt"
            rows={6}
            value={form.system_prompt}
            onChange={(e) =>
              setForm((f) => ({ ...f, system_prompt: e.target.value }))
            }
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user_prompt_template">
            {t('prompts.templateLabel')}
          </Label>
          <textarea
            id="user_prompt_template"
            rows={4}
            value={form.user_prompt_template}
            onChange={(e) =>
              setForm((f) => ({ ...f, user_prompt_template: e.target.value }))
            }
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is_active"
            type="checkbox"
            checked={form.is_active}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_active: e.target.checked }))
            }
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="is_active">{t('prompts.activeLabel')}</Label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {t('common:save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/ai/prompts')}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </div>
  )
}
