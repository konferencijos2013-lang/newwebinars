import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Plus, Funnel as FunnelIcon, ArrowRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { deleteFunnel, fetchFunnels } from '@/features/funnels/api/funnels'
import type { Funnel as FunnelType } from '@/shared/database.types'

export function FunnelsPage() {
  const { t } = useTranslation('funnels')
  const navigate = useNavigate()
  const account = useAccount()
  const [funnels, setFunnels] = useState<FunnelType[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (account.status !== 'ready') return
    let isActive = true

    fetchFunnels(account.account.id)
      .then((data) => {
        if (!isActive) return
        setFunnels(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [account.status, account.account?.id])

  async function handleDelete(funnel: FunnelType) {
    if (!window.confirm(t('deleteConfirm', { name: funnel.name }))) return
    try {
      await deleteFunnel(funnel.id)
      setFunnels((current) => current.filter((item) => item.id !== funnel.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
      <div className="mx-auto max-w-5xl">
        <p className="text-red-600 dark:text-red-400">
          {error ?? t('errorLoading')}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/funnels/new')}>
          <Plus className="mr-2 h-4 w-4" />
          {t('create')}
        </Button>
      </div>

      {funnels.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FunnelIcon className="text-muted-foreground mb-4 h-12 w-12" />
          <CardTitle>{t('emptyTitle')}</CardTitle>
          <CardDescription className="mt-2 max-w-sm">
            {t('emptyDescription')}
          </CardDescription>
          <Button className="mt-6" onClick={() => navigate('/funnels/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((funnel) => (
            <Card
              key={funnel.id}
              className="hover:border-primary/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/funnels/${funnel.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{funnel.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    /{funnel.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 w-8 px-0"
                    aria-label={t('delete')}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDelete(funnel)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ArrowRight className="text-muted-foreground h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    funnel.status === 'published'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                  }`}
                >
                  {funnel.status}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
