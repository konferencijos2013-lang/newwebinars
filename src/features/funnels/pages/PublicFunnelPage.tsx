import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { BlockRenderer } from '@/features/funnels/components/BlockRenderer'
import { supabase } from '@/lib/supabase'
import type { FunnelBlock } from '@/shared/database.types'

type PublicFunnelPageData = {
  funnel_name: string
  page_name: string
  blocks: FunnelBlock[]
}

export function PublicFunnelPage() {
  const { slug, path } = useParams<{ slug: string; path: string }>()
  const [data, setData] = useState<PublicFunnelPageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug || !path) return
    void (async () => {
      try {
        const { data: result, error: requestError } = await supabase
          .rpc('get_published_funnel_page', {
            funnel_slug: slug,
            page_path: path,
          })
          .single()
        if (requestError) throw requestError
        setData(result as PublicFunnelPageData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Page not found')
      }
    })()
  }, [path, slug])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="py-16 text-center">
          <h1 className="text-xl font-semibold">Puslapis nerastas</h1>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
        </Card>
      </div>
    )
  }
  if (!data)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )

  return (
    <main className="bg-muted/30 min-h-screen py-6 sm:py-10">
      <div className="bg-background mx-auto min-h-[80vh] max-w-4xl rounded-lg border shadow-sm">
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-6 sm:p-5">
          {data.blocks.map((block) => {
            const span = Number(
              (block.settings as Record<string, unknown>)?.column_span,
            )
            return (
              <div
                key={block.id}
                className={
                  span === 4
                    ? 'sm:col-span-2'
                    : span === 6
                      ? 'sm:col-span-3'
                      : 'sm:col-span-6'
                }
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
