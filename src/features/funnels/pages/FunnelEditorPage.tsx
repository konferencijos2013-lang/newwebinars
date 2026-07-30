import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye, Globe, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { FunnelEditor } from '@/features/funnels/components/FunnelEditor'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import {
  fetchFunnel,
  fetchFunnelPages,
  fetchFunnelBlocks,
  updateFunnel,
} from '@/features/funnels/api/funnels'
import type { Funnel, FunnelPage, FunnelBlock } from '@/shared/database.types'

export function FunnelEditorPage() {
  const { t } = useTranslation('funnels')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [pages, setPages] = useState<FunnelPage[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<FunnelBlock[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let isActive = true

    Promise.all([fetchFunnel(id), fetchFunnelPages(id)])
      .then(([f, p]) => {
        if (!isActive) return
        setFunnel(f)
        setPages(p)
        const defaultPage = p.find((page) => page.is_default) ?? p[0]
        setActivePageId(defaultPage?.id ?? null)

        if (defaultPage) {
          fetchFunnelBlocks(defaultPage.id)
            .then((b) => {
              if (!isActive) return
              setBlocks(b)
              setStatus('ready')
            })
            .catch((err) => {
              if (!isActive) return
              setError(err instanceof Error ? err.message : String(err))
              setStatus('error')
            })
        } else {
          setStatus('ready')
        }
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [id])

  async function handlePublish() {
    if (!funnel) return
    try {
      const updated = await updateFunnel(funnel.id, { status: 'published' })
      setFunnel(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function switchPage(pageId: string) {
    setActivePageId(pageId)
    setBlocks([])
    setStatus('loading')
    try {
      const b = await fetchFunnelBlocks(pageId)
      setBlocks(b)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !funnel) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="text-center">
          <h3 className="text-lg font-semibold">{t('errorNotFound')}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {error ?? t('errorNotFound')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/funnels')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
        </Card>
      </div>
    )
  }

  const activePage = pages.find((p) => p.id === activePageId)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/funnels')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {funnel.name}
            </h1>
            <p className="text-muted-foreground text-sm">/{funnel.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              activePage &&
              window.open(
                `/funnels/${funnel.id}/preview/${activePage.path}`,
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            <Eye className="mr-2 h-4 w-4" />
            {t('preview')}
          </Button>
          {funnel.status !== 'published' && (
            <Button size="sm" onClick={handlePublish}>
              <Globe className="mr-2 h-4 w-4" />
              {t('publish')}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {pages.map((page) => (
          <Button
            key={page.id}
            variant={page.id === activePageId ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchPage(page.id)}
          >
            <PenLine className="mr-2 h-4 w-4" />
            {page.name}
          </Button>
        ))}
      </div>

      {activePage ? (
        <FunnelEditor
          page={activePage}
          accountId={funnel.account_id}
          initialBlocks={blocks}
        />
      ) : (
        <Card className="py-12 text-center">
          <p className="text-muted-foreground">{t('noPages')}</p>
        </Card>
      )}

      {funnel && (
        <AiAssistant
          scope="funnel"
          scopeId={funnel.id}
          contextPrompt={`Help me build the funnel "${funnel.name}".`}
        />
      )}
    </div>
  )
}
