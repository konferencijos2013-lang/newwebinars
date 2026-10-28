import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { BlockRenderer } from '@/features/funnels/components/BlockRenderer'
import {
  fetchFunnel,
  fetchFunnelBlocks,
  fetchFunnelPages,
} from '@/features/funnels/api/funnels'
import type {
  Funnel,
  FunnelBlock,
  FunnelPage,
  Webinar,
} from '@/shared/database.types'
import { fetchWebinar } from '@/features/webinars/api/webinars'
import { backgroundStyle, pageContentStyle } from '@/features/funnels/pageTheme'

export function FunnelPreviewPage() {
  const { id, path } = useParams<{ id: string; path: string }>()
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [page, setPage] = useState<FunnelPage | null>(null)
  const [blocks, setBlocks] = useState<FunnelBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !path) return
    void (async () => {
      try {
        const nextFunnel = await fetchFunnel(id)
        setFunnel(nextFunnel)
        if (nextFunnel.webinar_id) {
          setWebinar(await fetchWebinar(nextFunnel.webinar_id))
        }
        const pages = await fetchFunnelPages(id)
        const nextPage = pages.find((item) => item.path === path)
        if (!nextPage) throw new Error('Puslapis nerastas')
        setPage(nextPage)
        setBlocks(await fetchFunnelBlocks(nextPage.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Puslapis nerastas')
      }
    })()
  }, [id, path])

  if (error)
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="py-16 text-center">
          <h1 className="text-xl font-semibold">Puslapis nerastas</h1>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
        </Card>
      </div>
    )
  if (!page || !blocks || !funnel)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )

  if (page.step_type === 'webinar_room' && webinar?.slug) {
    return <Navigate replace to={`/w/${webinar.slug}/room?preview=1`} />
  }

  return (
    <main
      className="bg-muted/30 min-h-screen overflow-x-clip"
      style={backgroundStyle(page.theme)}
    >
      <div
        className="mx-auto min-h-[80vh]"
        style={pageContentStyle(page.theme)}
      >
        <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-6 sm:px-5 sm:py-5">
          {blocks.map((block) => {
            const span = Number(
              (block.settings as Record<string, unknown>)?.column_span,
            )
            const widthMode = String(
              (block.settings as Record<string, unknown>)?.width_mode ??
                'container',
            )
            return (
              <div
                key={block.id}
                className={`${
                  block.block_type === 'webinar_hero'
                    ? 'sm:col-span-6'
                    : widthMode === 'viewport'
                      ? 'relative left-1/2 w-screen max-w-none -translate-x-1/2 sm:col-span-6'
                      : widthMode === 'page'
                        ? '-mx-3 sm:col-span-6 sm:-mx-5'
                        : span === 4
                          ? 'sm:col-span-2'
                          : span === 6
                            ? 'sm:col-span-3'
                            : 'sm:col-span-6'
                }`}
              >
                <BlockRenderer
                  block={block}
                  isPreview
                  funnelSlug={funnel.slug}
                  webinarId={webinar?.id}
                  webinarSlug={webinar?.slug}
                  webinarScheduledAt={webinar?.scheduled_at}
                  webinarRegistrationMethod={webinar?.registration_method}
                  webinarAccessMode={webinar?.access_mode}
                  webinarPriceCents={webinar?.price_cents}
                  availableBlockIds={blocks.map((item) => item.id)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
