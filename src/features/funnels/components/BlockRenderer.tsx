import { useEffect, useState } from 'react'
import { MessageCircle, Play, User, Clock, ImageIcon } from 'lucide-react'
import type { FunnelBlock } from '@/shared/database.types'
import { backgroundStyle } from '@/features/funnels/pageTheme'

function Countdown({
  content,
  blockId,
}: {
  content: Record<string, unknown>
  blockId: string
}) {
  const [now, setNow] = useState(() => Date.now())
  const mode = content.mode === 'visitor' ? 'visitor' : 'fixed'
  const durationMinutes = Math.max(1, Number(content.duration_minutes) || 10)
  const storageKey = `newwebinars:countdown:${blockId}`
  const [visitorStart] = useState(() => {
    if (mode !== 'visitor' || typeof window === 'undefined') return Date.now()
    const existing = window.sessionStorage.getItem(storageKey)
    if (existing && Number.isFinite(Number(existing))) return Number(existing)
    const startedAt = Date.now()
    window.sessionStorage.setItem(storageKey, String(startedAt))
    return startedAt
  })

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const target =
    mode === 'visitor'
      ? visitorStart + durationMinutes * 60_000
      : new Date(String(content.target ?? '')).getTime()
  const seconds = Number.isFinite(target)
    ? Math.max(0, Math.ceil((target - now) / 1_000))
    : 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  const value = [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')

  return <span className="text-2xl font-bold tabular-nums">{value}</span>
}

function Rich({
  html,
  fallback,
  className,
}: {
  html: unknown
  fallback: string
  className?: string
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: (html as string) || fallback }}
    />
  )
}

function BlockContent({
  block,
  isPreview = false,
}: {
  block: FunnelBlock
  isPreview?: boolean
}) {
  const content = (block.content as Record<string, unknown>) || {}

  const common = isPreview ? 'p-6 rounded-lg' : 'p-4'

  switch (block.block_type) {
    case 'hero':
      return (
        <div
          className={`${common} text-center`}
          style={{
            textAlign:
              (content.align as React.CSSProperties['textAlign']) || 'center',
          }}
        >
          <Rich
            html={content.title}
            fallback="Hero title"
            className="text-foreground text-3xl font-bold [&_a]:underline"
          />
          <Rich
            html={content.subtitle}
            fallback="Subtitle"
            className="text-muted-foreground mt-2 [&_a]:underline"
          />
        </div>
      )
    case 'text':
      return (
        <div className={common}>
          <Rich
            html={content.text}
            fallback="Text content"
            className="text-foreground [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          />
        </div>
      )
    case 'image': {
      const url = content.url as string
      const alt = (content.alt as string) || ''
      return (
        <div className={common}>
          {url ? (
            <img
              src={url}
              alt={alt}
              className="mx-auto h-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center rounded-lg">
              <ImageIcon className="h-12 w-12" />
            </div>
          )}
        </div>
      )
    }
    case 'video':
      return (
        <div className={common}>
          <div className="bg-muted flex aspect-video items-center justify-center rounded-lg">
            <Play className="text-muted-foreground h-12 w-12" />
          </div>
        </div>
      )
    case 'registration_form':
      return (
        <div className={common}>
          <form className="mx-auto max-w-md space-y-3">
            <input
              disabled
              placeholder="Email"
              className="border-border w-full rounded-md border px-3 py-2 text-sm"
            />
            <button
              disabled
              className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm"
            >
              {(content.buttonText as string) ?? 'Register'}
            </button>
          </form>
        </div>
      )
    case 'countdown':
      return (
        <div className={common}>
          <div className="flex justify-center gap-4">
            <Clock className="text-muted-foreground h-8 w-8" />
            <Countdown content={content} blockId={block.id} />
          </div>
        </div>
      )
    case 'benefits':
      return (
        <div className={common}>
          <ul className="mx-auto max-w-md list-disc space-y-1 pl-5">
            {(
              (content.items as string[]) ?? ['Benefit one', 'Benefit two']
            ).map((item, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        </div>
      )
    case 'speaker':
      return (
        <div className={common}>
          <div className="flex items-center gap-3">
            <User className="text-muted-foreground h-10 w-10" />
            <div>
              <p className="font-semibold">
                {(content.name as string) ?? 'Speaker name'}
              </p>
              <Rich
                html={content.bio}
                fallback="Short bio"
                className="text-muted-foreground text-sm"
              />
            </div>
          </div>
        </div>
      )
    case 'chat':
      return (
        <div className={common}>
          <div className="border-border bg-muted mx-auto max-w-md rounded-lg border p-4">
            <div className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
              <MessageCircle className="h-4 w-4" />
              <Rich html={content.title} fallback="Live chat" />
            </div>
            <div className="text-muted-foreground py-4 text-center text-sm">
              Chat messages will appear here
            </div>
          </div>
        </div>
      )
    case 'cta':
      return (
        <div className={common}>
          <div className="text-center">
            <a
              href={(content.url as string) ?? '#'}
              className="bg-primary text-primary-foreground inline-block rounded-md px-6 py-3 font-medium"
            >
              <Rich html={content.text} fallback="Get access now" />
            </a>
          </div>
        </div>
      )
    case 'offer':
      return (
        <div className={common}>
          <div className="border-border mx-auto max-w-md rounded-lg border p-6 text-center">
            <Rich
              html={content.title}
              fallback="Special offer"
              className="font-semibold"
            />
            <p className="text-muted-foreground text-sm">
              {(content.price as string) ?? '$0.00'}
            </p>
          </div>
        </div>
      )
    case 'order_form':
      return (
        <div className={common}>
          <button
            disabled
            className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2"
          >
            {(content.buttonText as string) ?? 'Complete purchase'}
          </button>
        </div>
      )
    case 'faq':
      return (
        <div className={common}>
          <div className="mx-auto max-w-md space-y-2">
            {(
              (content.items as Array<{
                question: string
                answer: string
              }>) ?? [{ question: 'Question?', answer: 'Answer.' }]
            ).map((item, idx) => (
              <div key={idx} className="border-b py-2">
                <Rich
                  html={item.question}
                  fallback="Question?"
                  className="font-medium"
                />
                <Rich
                  html={item.answer}
                  fallback="Answer."
                  className="text-muted-foreground text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )
    default:
      return (
        <div className={common}>
          <p className="text-muted-foreground text-sm">Unknown block</p>
        </div>
      )
  }
}

export function BlockRenderer({
  block,
  isPreview = false,
}: {
  block: FunnelBlock
  isPreview?: boolean
}) {
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={backgroundStyle(block.settings as Record<string, unknown>)}
    >
      <BlockContent block={block} isPreview={isPreview} />
    </div>
  )
}
