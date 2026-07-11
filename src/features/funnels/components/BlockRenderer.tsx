import { MessageCircle, Play, User, Clock } from 'lucide-react'
import type { FunnelBlock } from '@/shared/database.types'

export function BlockRenderer({
  block,
  isPreview = false,
}: {
  block: FunnelBlock
  isPreview?: boolean
}) {
  const content = (block.content as Record<string, unknown>) || {}

  const common = isPreview
    ? 'border-2 border-dashed border-transparent hover:border-primary/30 p-4 rounded-lg transition-colors'
    : 'p-4'

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
          <h2 className="text-foreground text-3xl font-bold">
            {(content.title as string) ?? 'Hero title'}
          </h2>
          <p className="text-muted-foreground mt-2">
            {(content.subtitle as string) ?? 'Subtitle'}
          </p>
        </div>
      )
    case 'text':
      return (
        <div className={common}>
          <p className="text-foreground whitespace-pre-wrap">
            {(content.text as string) ?? 'Text content'}
          </p>
        </div>
      )
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
            <span className="text-2xl font-bold">00:00:00</span>
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
              <li key={idx}>{item}</li>
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
              <p className="text-muted-foreground text-sm">
                {(content.bio as string) ?? 'Short bio'}
              </p>
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
              {(content.title as string) ?? 'Live chat'}
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
              {(content.text as string) ?? 'Get access now'}
            </a>
          </div>
        </div>
      )
    case 'offer':
      return (
        <div className={common}>
          <div className="border-border mx-auto max-w-md rounded-lg border p-6 text-center">
            <p className="font-semibold">
              {(content.title as string) ?? 'Special offer'}
            </p>
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
                <p className="font-medium">{item.question}</p>
                <p className="text-muted-foreground text-sm">{item.answer}</p>
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
