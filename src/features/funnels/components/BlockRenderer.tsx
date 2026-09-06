import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import {
  CalendarDays,
  CheckCircle2,
  ImageIcon,
  MessageCircle,
  Play,
  User,
} from 'lucide-react'
import type { FunnelBlock } from '@/shared/database.types'
import { backgroundStyle } from '@/features/funnels/pageTheme'
import {
  getTelegramRegistrationIntentStatus,
  registerForWebinar,
  startTelegramWebinarRegistration,
} from '@/features/webinars/api/public'
import { trackAnalyticsEvent } from '@/features/analytics/dataLayer'
import { safePublicUrl } from './safePublicUrl'

function remainingTime(target: number, now: number) {
  const total = Number.isFinite(target)
    ? Math.max(0, Math.ceil((target - now) / 1_000))
    : 0
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  }
}

function Countdown({
  content,
  blockId,
  fallbackTarget,
  cards = false,
}: {
  content: Record<string, unknown>
  blockId: string
  fallbackTarget?: string | null
  cards?: boolean
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
      : new Date(String(content.target || fallbackTarget || '')).getTime()
  const parts = remainingTime(target, now)

  if (!cards) {
    const hours = parts.days * 24 + parts.hours
    return (
      <span className="text-2xl font-bold tabular-nums">
        {[hours, parts.minutes, parts.seconds]
          .map((part) => String(part).padStart(2, '0'))
          .join(':')}
      </span>
    )
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3" aria-label="Countdown">
      {[
        [parts.days, 'D.'],
        [parts.hours, 'H.'],
        [parts.minutes, 'MIN.'],
        [parts.seconds, 'SEC.'],
      ].map(([value, label]) => (
        <div
          key={label}
          className="min-w-16 rounded-xl bg-white/95 px-3 py-2 text-center text-slate-900 shadow-sm"
        >
          <div className="text-2xl font-bold tabular-nums">
            {String(value).padStart(2, '0')}
          </div>
          <div className="text-[10px] font-medium tracking-wider text-slate-500">
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

function sanitizeHtml(value: unknown, fallback = '') {
  const html = typeof value === 'string' && value.trim() ? value : fallback
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style'],
  })
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
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, fallback) }}
    />
  )
}

type WebinarContext = {
  webinarId?: string | null
  webinarSlug?: string | null
  webinarScheduledAt?: string | null
  webinarRegistrationMethod?: 'email' | 'telegram' | 'both' | null
}

function RegistrationForm({
  content,
  isPreview,
  webinar,
}: {
  content: Record<string, unknown>
  isPreview: boolean
  webinar: WebinarContext
}) {
  const { t } = useTranslation('public')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [intentId, setIntentId] = useState<string | null>(null)
  const collectName = content.collectName !== false
  const configuredMethod = String(content.registrationMethod ?? 'inherit')
  const method = (
    configuredMethod === 'inherit'
      ? (webinar.webinarRegistrationMethod ?? 'email')
      : configuredMethod
  ) as 'email' | 'telegram' | 'both'

  useEffect(() => {
    if (!intentId) return
    const interval = window.setInterval(async () => {
      try {
        const state = await getTelegramRegistrationIntentStatus(intentId)
        if (state?.status === 'completed' && state.registration_access_token) {
          setToken(state.registration_access_token)
          setIntentId(null)
          trackAnalyticsEvent('webinar_registration', {
            registration_method: 'telegram',
            registration_source: 'funnel',
          })
        } else if (state?.status === 'expired') {
          setIntentId(null)
          setError(t('telegramExpired'))
        }
      } catch {
        /* Keep polling until expiration or completion. */
      }
    }, 2000)
    return () => window.clearInterval(interval)
  }, [intentId, t])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isPreview || !webinar.webinarId) return
    setSubmitting(true)
    setError(null)
    try {
      const params = new URLSearchParams(window.location.search)
      const registration = await registerForWebinar({
        webinar_id: webinar.webinarId,
        email: email.trim(),
        full_name: collectName ? fullName.trim() || null : null,
        referral_code: params.get('ref'),
        referrer_url: window.location.href,
      })
      setToken(registration.access_token)
      trackAnalyticsEvent('webinar_registration', {
        registration_method: 'email',
        registration_source: 'funnel',
      })
      trackAnalyticsEvent('generate_lead', {
        lead_type: 'webinar_registration',
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('registrationFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function startTelegram() {
    if (isPreview || !webinar.webinarId) return
    setSubmitting(true)
    setError(null)
    try {
      const params = new URLSearchParams(window.location.search)
      const intent = await startTelegramWebinarRegistration({
        webinar_id: webinar.webinarId,
        full_name: collectName ? fullName.trim() || null : null,
        referral_code: params.get('ref'),
        referrer_url: window.location.href,
      })
      setIntentId(intent.intent_id)
      window.open(intent.connect_url, '_blank', 'noopener,noreferrer')
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('telegramStartFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (token) {
    const waitingRoom = webinar.webinarSlug
      ? `/${webinar.webinarSlug}/waiting-room?token=${token}`
      : null
    return (
      <div className="mx-auto max-w-md rounded-xl bg-emerald-50 p-5 text-center text-emerald-900">
        <CheckCircle2 className="mx-auto h-8 w-8" />
        <p className="mt-2 font-semibold">
          {String(content.successMessage || t('registeredTitle'))}
        </p>
        {waitingRoom && (
          <a
            className="mt-4 inline-block font-medium underline"
            href={waitingRoom}
          >
            {t('enterWaitingRoom')}
          </a>
        )}
      </div>
    )
  }

  const disabled = isPreview || !webinar.webinarId || submitting
  return (
    <div className="mx-auto max-w-md space-y-3">
      {typeof content.title === 'string' && content.title.trim() && (
        <Rich
          html={content.title}
          fallback={t('register')}
          className="mb-4 text-center text-2xl font-bold"
        />
      )}
      {collectName && (
        <input
          disabled={disabled}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder={t('fullName')}
          className="border-border bg-background w-full rounded-xl border px-4 py-3 text-sm"
        />
      )}
      {(method === 'email' || method === 'both') && (
        <form onSubmit={submit} className="space-y-3">
          <input
            required
            type="email"
            disabled={disabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('email')}
            className="border-border bg-background w-full rounded-xl border px-4 py-3 text-sm"
          />
          <button
            disabled={disabled}
            className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-60"
          >
            {submitting
              ? 'Registering…'
              : String(content.buttonText || t('registerByEmail'))}
          </button>
        </form>
      )}
      {method === 'both' && (
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="h-px flex-1 bg-current opacity-20" />
          {t('or')}
          <span className="h-px flex-1 bg-current opacity-20" />
        </div>
      )}
      {(method === 'telegram' || method === 'both') && (
        <button
          type="button"
          disabled={disabled}
          onClick={startTelegram}
          className="w-full rounded-xl bg-[#229ED9] px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          <MessageCircle className="mr-2 inline h-4 w-4" />
          {t('registerViaTelegram')}
        </button>
      )}
      {intentId && (
        <p className="text-center text-sm text-sky-700">
          {t('telegramPending')}
        </p>
      )}
      {!webinar.webinarId && (
        <p className="text-muted-foreground text-center text-xs">
          {t('linkFunnelWebinar')}
        </p>
      )}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}

function WebinarHero({
  block,
  content,
  webinar,
}: {
  block: FunnelBlock
  content: Record<string, unknown>
  webinar: WebinarContext
}) {
  const imageUrl = safePublicUrl(content.imageUrl, '')
  const dateLabel = String(
    content.dateLabel ||
      (webinar.webinarScheduledAt
        ? new Date(webinar.webinarScheduledAt).toLocaleString()
        : ''),
  )
  return (
    <section className="px-4 py-8 text-center sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={String(content.imageAlt || '')}
            className="mx-auto mb-7 max-h-[32rem] w-full max-w-2xl rounded-[2rem] object-cover shadow-sm"
          />
        )}
        {typeof content.eyebrow === 'string' && content.eyebrow.trim() && (
          <Rich
            html={content.eyebrow}
            fallback="Free webinar"
            className="mb-3 text-xs font-semibold tracking-[0.22em] uppercase opacity-70"
          />
        )}
        <Rich
          html={content.title}
          fallback="Webinar title"
          className="text-3xl leading-tight font-bold sm:text-5xl"
        />
        <Rich
          html={content.subtitle}
          fallback="Join us for a live session"
          className="mx-auto mt-3 max-w-2xl text-base opacity-75 sm:text-lg"
        />
        {(dateLabel ||
          (typeof content.badge === 'string' && content.badge.trim())) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
            {dateLabel && (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> {dateLabel}
              </span>
            )}
            {typeof content.badge === 'string' && content.badge.trim() && (
              <span className="rounded-full bg-white/50 px-3 py-1">
                {String(content.badge)}
              </span>
            )}
          </div>
        )}
        {content.showCountdown !== false && (
          <div className="mt-6">
            <Countdown
              content={content}
              blockId={block.id}
              fallbackTarget={webinar.webinarScheduledAt}
              cards
            />
          </div>
        )}
        <a
          href="#registration"
          className="mt-7 inline-flex min-w-64 items-center justify-center rounded-full bg-[#78a653] px-8 py-4 font-bold text-white shadow-lg"
        >
          {String(content.buttonText || 'Register for free')} ↓
        </a>
      </div>
    </section>
  )
}

function BlockContent({
  block,
  isPreview = false,
  webinar,
}: {
  block: FunnelBlock
  isPreview?: boolean
  webinar: WebinarContext
}) {
  const content = (block.content as Record<string, unknown>) || {}
  const common = isPreview ? 'p-6 rounded-lg' : 'p-4'

  switch (block.block_type) {
    case 'webinar_hero':
      return <WebinarHero block={block} content={content} webinar={webinar} />
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
      const url = safePublicUrl(content.url, '')
      return (
        <div className={common}>
          {url ? (
            <img
              src={url}
              alt={String(content.alt || '')}
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
        <div id="registration" className={common}>
          <RegistrationForm
            content={content}
            isPreview={isPreview}
            webinar={webinar}
          />
        </div>
      )
    case 'countdown':
      return (
        <div className={common}>
          <Countdown
            content={content}
            blockId={block.id}
            fallbackTarget={webinar.webinarScheduledAt}
            cards={content.style === 'cards'}
          />
        </div>
      )
    case 'benefits':
      return (
        <div className={common}>
          <ul className="mx-auto max-w-md list-disc space-y-1 pl-5">
            {(
              (content.items as string[]) ?? ['Benefit one', 'Benefit two']
            ).map((item, idx) => (
              <li
                key={idx}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(item) }}
              />
            ))}
          </ul>
        </div>
      )
    case 'speaker': {
      const photo = safePublicUrl(content.imageUrl, '')
      return (
        <div className={common}>
          <div className="mx-auto flex max-w-xl items-center gap-4">
            {photo ? (
              <img
                src={photo}
                alt={String(content.name || '')}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <User className="text-muted-foreground h-10 w-10" />
            )}
            <div>
              <p className="font-semibold">
                {String(content.name || 'Speaker name')}
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
    }
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
              href={safePublicUrl(content.url)}
              className="bg-primary text-primary-foreground inline-block rounded-full px-8 py-3 font-semibold"
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
              {String(content.price || '$0.00')}
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
            {String(content.buttonText || 'Complete purchase')}
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
  webinarId,
  webinarSlug,
  webinarScheduledAt,
  webinarRegistrationMethod,
}: {
  block: FunnelBlock
  isPreview?: boolean
  webinarId?: string | null
  webinarSlug?: string | null
  webinarScheduledAt?: string | null
  webinarRegistrationMethod?: 'email' | 'telegram' | 'both' | null
}) {
  const sticky =
    block.block_type === 'cta' && block.settings?.sticky_mobile === true
  return (
    <div
      className={
        sticky
          ? 'sticky bottom-0 z-40 overflow-hidden rounded-lg md:static'
          : 'overflow-hidden rounded-lg'
      }
      style={backgroundStyle(block.settings as Record<string, unknown>)}
    >
      <BlockContent
        block={block}
        isPreview={isPreview}
        webinar={{
          webinarId,
          webinarSlug,
          webinarScheduledAt,
          webinarRegistrationMethod,
        }}
      />
    </div>
  )
}
