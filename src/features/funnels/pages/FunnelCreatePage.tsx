import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  createFunnel,
  createDefaultPages,
} from '@/features/funnels/api/funnels'
import { fetchWebinars } from '@/features/webinars/api/webinars'
import type { Webinar } from '@/shared/database.types'

export function FunnelCreatePage() {
  const { t } = useTranslation('funnels')
  const navigate = useNavigate()
  const account = useAccount()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [webinarId, setWebinarId] = useState('')
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (account.status !== 'ready') return
    let isActive = true
    fetchWebinars(account.account.id)
      .then((data) => {
        if (!isActive) return
        setWebinars(data)
      })
      .catch(() => {})
    return () => {
      isActive = false
    }
  }, [account.status, account.account?.id])

  if (account.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-primary h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (account.status !== 'ready') {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-muted-foreground">{t('errorLoading')}</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (account.status !== 'ready') return
    setIsSaving(true)
    setError(null)

    try {
      const generatedSlug =
        slug.trim() || name.toLowerCase().replace(/\s+/g, '-')
      const funnel = await createFunnel({
        account_id: account.account.id,
        name: name.trim(),
        slug: generatedSlug,
        webinar_id: webinarId || null,
      })
      await createDefaultPages(funnel.id, webinarId || null)
      navigate(`/funnels/${funnel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('createTitle')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('createSubtitle')}</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">{t('funnelName')}</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('funnelNamePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">{t('slug')}</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t('slugPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webinar">{t('linkWebinar')}</Label>
            <Select
              id="webinar"
              value={webinarId}
              onChange={(e) => setWebinarId(e.target.value)}
            >
              <option value="">{t('noWebinar')}</option>
              {webinars?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </Select>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/funnels')}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
