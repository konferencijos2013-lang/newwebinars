import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { BlockRenderer } from '@/features/funnels/components/BlockRenderer'
import { supabase } from '@/lib/supabase'
import type { FunnelBlock } from '@/shared/database.types'
import { backgroundStyle, pageContentStyle } from '@/features/funnels/pageTheme'

type PublicFunnelPageData = {
  funnel_name: string
  page_name: string
  theme: Record<string, unknown> | null
  blocks: FunnelBlock[]
  webinar_id: string | null
  webinar_slug: string | null
  webinar_scheduled_at: string | null
  webinar_registration_method: 'email' | 'telegram' | 'both' | null
  webinar_access_mode: string | null
  webinar_price_cents: number | null
}

export function PublicFunnelPage() {
  const { t } = useTranslation('funnels')
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
      } catch {
        setError('Page not found')
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

  if (path === 'room') {
    if (data.webinar_slug) {
      return (
        <Navigate
          replace
          to={`/w/${data.webinar_slug}/room${window.location.search}`}
        />
      )
    }
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="py-16 text-center">
          <h1 className="text-xl font-semibold">
            {t('webinarRoomUnavailable')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('webinarRoomUnavailableDescription')}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <main
      className="bg-muted/30 min-h-screen overflow-x-clip"
      style={backgroundStyle(data.theme)}
    >
      <div
        className="mx-auto min-h-[80vh]"
        style={pageContentStyle(data.theme)}
      >
        <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-6 sm:px-5 sm:py-5">
          {data.blocks.map((block) => {
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
                  availableBlockIds={data.blocks.map((item) => item.id)}
                  webinarId={data.webinar_id}
                  funnelSlug={slug}
                  webinarSlug={data.webinar_slug}
                  webinarScheduledAt={data.webinar_scheduled_at}
                  webinarRegistrationMethod={data.webinar_registration_method}
                  webinarAccessMode={data.webinar_access_mode}
                  webinarPriceCents={data.webinar_price_cents}
                />
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
