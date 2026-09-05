import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { BlockRenderer } from '@/features/funnels/components/BlockRenderer'
import {
  fetchFunnelBlocks,
  fetchFunnelPages,
} from '@/features/funnels/api/funnels'
import type { FunnelBlock, FunnelPage } from '@/shared/database.types'
import { backgroundStyle } from '@/features/funnels/pageTheme'

export function FunnelPreviewPage() {
  const { id, path } = useParams<{ id: string; path: string }>()
  const [page, setPage] = useState<FunnelPage | null>(null)
  const [blocks, setBlocks] = useState<FunnelBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !path) return
    void (async () => {
      try {
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
  if (!page || !blocks)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )

  return (
    <main
      className="bg-muted/30 min-h-screen overflow-x-clip"
      style={backgroundStyle(page.theme)}
    >
      <div className="mx-auto min-h-[80vh] max-w-4xl">
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
                  widthMode === 'viewport'
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
                <BlockRenderer block={block} />
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
