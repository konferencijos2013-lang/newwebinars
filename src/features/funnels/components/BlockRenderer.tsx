import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ImageIcon,
  MessageCircle,
  Play,
  User,
} from 'lucide-react'
import type { FunnelBlock } from '@/shared/database.types'
import { localizedPath } from '@/i18n/localePath'
import { backgroundStyle } from '@/features/funnels/pageTheme'
import {
  getTelegramRegistrationIntentStatus,
  registerForWebinar,
  registrationFailureMessage,
  startTelegramWebinarRegistration,
  startWebinarTicketCheckout,
} from '@/features/webinars/api/public'
import { trackAnalyticsEvent } from '@/features/analytics/dataLayer'
import { WaitingRoomContent } from '@/features/webinars/components/WaitingRoomContent'
import { safePublicUrl } from './safePublicUrl'
import { formatOfferPrice, normalizeOfferTiers } from './offerTiers'

function cssColor(value: unknown) {
  const color = String(value ?? '').trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
    ? color
    : ''
}

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
  align = 'center',
}: {
  content: Record<string, unknown>
  blockId: string
  fallbackTarget?: string | null
  cards?: boolean
  align?: 'center' | 'start'
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
    <div
      className={`flex justify-center gap-2 sm:gap-3 ${align === 'start' ? '@3xl:justify-start' : ''}`}
      aria-label="Countdown"
    >
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
  funnelSlug?: string | null
  webinarId?: string | null
  webinarSlug?: string | null
  webinarScheduledAt?: string | null
  webinarRegistrationMethod?: 'email' | 'telegram' | 'both' | null
  webinarAccessMode?: string | null
  webinarPriceCents?: number | null
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
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [intentId, setIntentId] = useState<string | null>(null)
  const hasRedirected = useRef(false)
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
        password: password.trim() || null,
      })
      if (registration.payment_required && !registration.paid_at) {
        await startWebinarTicketCheckout(registration.access_token)
        return
      }
      setToken(registration.access_token)
      trackAnalyticsEvent('webinar_registration', {
        registration_method: 'email',
        registration_source: 'funnel',
      })
      trackAnalyticsEvent('generate_lead', {
        lead_type: 'webinar_registration',
      })
    } catch (reason) {
      setError(registrationFailureMessage(reason))
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
        password: password.trim() || null,
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

  const waitingRoom =
    token && webinar.funnelSlug
      ? `/f/${webinar.funnelSlug}/waiting-room?token=${encodeURIComponent(token)}`
      : null

  useEffect(() => {
    if (!waitingRoom || isPreview || hasRedirected.current) return
    hasRedirected.current = true
    window.location.assign(localizedPath(waitingRoom))
  }, [isPreview, waitingRoom])

  if (token) {
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
      {webinar.webinarAccessMode === 'paid_access' &&
      webinar.webinarPriceCents ? (
        <p className="text-muted-foreground text-center text-sm">
          Įėjimas mokamas:{' '}
          {(webinar.webinarPriceCents / 100).toLocaleString('lt-LT', {
            style: 'currency',
            currency: 'EUR',
          })}
        </p>
      ) : null}
      {webinar.webinarAccessMode === 'password_protected' && (
        <input
          disabled={disabled}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Slaptažodis"
          className="border-border bg-background w-full rounded-xl border px-4 py-3 text-sm"
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

function Offer({ content }: { content: Record<string, unknown> }) {
  const tiers = normalizeOfferTiers(content)
  if (!tiers.length) {
    return (
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
    )
  }
  return (
    <div className="@container mx-auto max-w-6xl">
      <Rich
        html={content.title}
        fallback="Special offer"
        className="mb-8 text-center text-3xl font-bold"
      />
      <div className="grid grid-cols-1 items-stretch gap-4 @xl:grid-cols-3">
        {tiers.map((tier, index) => {
          const href = safePublicUrl(tier.buttonUrl)
          const external = /^https?:\/\//i.test(href)
          const features = Array.isArray(tier.features) ? tier.features : []
          const tierPeriodLabel = String(tier.period || '').trim()
          return (
            <article
              key={index}
              className={`flex min-w-0 flex-col rounded-2xl border p-5 ${tier.featured ? 'border-primary ring-primary shadow-lg ring-2' : 'border-border'}`}
            >
              {String(tier.badge || '').trim() && (
                <span className="bg-primary text-primary-foreground mb-3 inline-flex w-fit self-center rounded-full px-3 py-1 text-xs font-semibold">
                  {String(tier.badge)}
                </span>
              )}
              <Rich
                html={tier.name}
                fallback={`Plan ${index + 1}`}
                className="text-xl font-bold break-words"
              />
              <Rich
                html={tier.description}
                fallback=""
                className="text-muted-foreground mt-2 text-sm break-words"
              />
              <div className="mt-5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="max-w-full text-3xl leading-none font-bold break-words @xl:text-2xl">
                  {formatOfferPrice(tier.price, tier.currency)}
                </span>
                {tierPeriodLabel && (
                  <span className="text-sm font-semibold opacity-70">
                    {tierPeriodLabel}
                  </span>
                )}
                {String(tier.oldPrice || '').trim() && (
                  <span className="text-muted-foreground text-sm line-through">
                    {formatOfferPrice(tier.oldPrice, tier.currency)}
                  </span>
                )}
              </div>
              {features.length > 0 && (
                <ul className="mt-6 flex-1 space-y-3 text-left">
                  {features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex min-w-0 gap-2">
                      <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <Rich
                        html={feature}
                        fallback=""
                        className="min-w-0 break-words [&_a]:underline"
                      />
                    </li>
                  ))}
                </ul>
              )}
              {String(tier.buttonText || '').trim() && (
                <a
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="bg-primary text-primary-foreground mt-6 rounded-full px-5 py-3 text-center font-semibold"
                >
                  {String(tier.buttonText)}
                </a>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function EditorImagePicker({
  className,
  style,
  label,
  onFile,
  onActivate,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  label: string
  onFile: (file: File) => Promise<void>
  onActivate?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation('funnels')
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div
      className={`relative cursor-pointer ${className ?? ''}`}
      style={style}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === inputRef.current) return
        onActivate?.()
        if (!uploading) inputRef.current?.click()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.stopPropagation()
        event.preventDefault()
        onActivate?.()
        if (!uploading) inputRef.current?.click()
      }}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={uploading}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setUploading(true)
          setError(null)
          void onFile(file)
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err))
            })
            .finally(() => setUploading(false))
        }}
      />
      <span className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-slate-900/80 px-3 py-1.5 text-center text-xs font-semibold text-white">
        {uploading ? t('imageUploading') : label}
      </span>
      {error && (
        <span className="absolute inset-x-3 top-3 rounded-md bg-red-600 px-2 py-1 text-center text-xs text-white">
          {error}
        </span>
      )}
    </div>
  )
}

function WebinarHero({
  block,
  content,
  webinar,
  availableBlockIds,
  isPreview,
  onReplaceImage,
  onActivateImage,
}: {
  block: FunnelBlock
  content: Record<string, unknown>
  webinar: WebinarContext
  availableBlockIds: Set<string>
  isPreview: boolean
  onReplaceImage?: (file: File) => Promise<void>
  onActivateImage?: () => void
}) {
  const { t } = useTranslation('funnels')
  const imageUrl = safePublicUrl(content.imageUrl, '')
  const showImage = content.showImage === true
  const imageLayout = content.imageLayout === 'split' ? 'split' : 'stacked'
  const imageWidthDesktop = Math.min(
    100,
    Math.max(25, Number(content.imageWidthDesktop ?? 100)),
  )
  const imageWidthMobile = Math.min(
    100,
    Math.max(25, Number(content.imageWidthMobile ?? 100)),
  )
  const imageStyle = {
    '--funnel-image-desktop-width': `${imageWidthDesktop}%`,
    '--funnel-image-mobile-width': `${imageWidthMobile}%`,
  } as React.CSSProperties
  const buttonAction = String(content.buttonAction ?? 'registration')
  const requestedTargetId = String(content.buttonTargetBlockId ?? '')
  const targetBlockId =
    buttonAction === 'block' && availableBlockIds.has(requestedTargetId)
      ? requestedTargetId
      : null
  const isExternalButton = buttonAction === 'url'
  const buttonHref = isExternalButton
    ? safePublicUrl(content.buttonUrl)
    : targetBlockId
      ? `#funnel-block-${targetBlockId}`
      : '#registration'
  const dateLabel = String(
    content.dateLabel ||
      (webinar.webinarScheduledAt
        ? new Date(webinar.webinarScheduledAt).toLocaleString()
        : ''),
  )
  const photoAlt = String(content.imageAlt || '')
  const showPhotoFrame = Boolean(imageUrl) || (showImage && isPreview)
  const photoFrameClass =
    imageLayout === 'split'
      ? 'mx-auto mb-7 aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2rem] bg-slate-200/80 shadow-sm @3xl:mx-0 @3xl:mb-0 @3xl:max-w-none'
      : 'mx-auto mb-7 aspect-[16/10] w-[var(--funnel-image-mobile-width)] max-w-full overflow-hidden rounded-[2rem] bg-slate-200/80 shadow-sm sm:w-[var(--funnel-image-desktop-width)]'
  const photoContent = imageUrl ? (
    <img src={imageUrl} alt={photoAlt} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 pb-10 text-center text-slate-500">
      <User className="h-12 w-12" />
      <span className="text-xs font-medium">
        {t('heroPhotoPlaceholder', {
          defaultValue: 'Upload a host photo',
        })}
      </span>
    </div>
  )
  const photo =
    showImage && showPhotoFrame ? (
      onReplaceImage ? (
        <EditorImagePicker
          style={imageStyle}
          className={photoFrameClass}
          label={
            imageUrl
              ? t('heroPhotoReplace', { defaultValue: 'Replace photo' })
              : t('heroPhotoChoose', { defaultValue: 'Choose a photo' })
          }
          onFile={onReplaceImage}
          onActivate={onActivateImage}
        >
          {photoContent}
        </EditorImagePicker>
      ) : (
        <div style={imageStyle} className={photoFrameClass}>
          {photoContent}
        </div>
      )
    ) : imageUrl ? (
      <img
        src={imageUrl}
        alt={photoAlt}
        style={imageStyle}
        className="mx-auto mb-7 h-auto w-[var(--funnel-image-mobile-width)] max-w-full rounded-[2rem] object-contain shadow-sm sm:w-[var(--funnel-image-desktop-width)]"
      />
    ) : null
  return (
    <section className="@container px-4 py-8 sm:px-8 sm:py-12">
      <div
        className={
          imageLayout === 'split' && showPhotoFrame
            ? 'mx-auto grid max-w-5xl items-center gap-8 text-center @3xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] @3xl:text-left'
            : 'mx-auto max-w-4xl text-center'
        }
      >
        {photo}
        <div>
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
            className={`mx-auto mt-3 max-w-2xl text-base opacity-75 sm:text-lg ${imageLayout === 'split' ? '@3xl:mx-0' : ''}`}
          />
          {(dateLabel ||
            (typeof content.badge === 'string' && content.badge.trim())) && (
            <div
              className={`mt-5 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold ${imageLayout === 'split' ? '@3xl:justify-start' : ''}`}
            >
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
                align={imageLayout === 'split' ? 'start' : 'center'}
              />
            </div>
          )}
          <a
            href={buttonHref}
            target={isExternalButton ? '_blank' : undefined}
            rel={isExternalButton ? 'noopener noreferrer' : undefined}
            onClick={(event) => {
              if (isExternalButton) return
              event.preventDefault()
              const target = document.querySelector(buttonHref)
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={`mt-7 inline-flex min-w-64 items-center justify-center rounded-full px-8 py-4 font-bold text-white shadow-lg ${cssColor(content.buttonColor) ? '' : 'bg-[#78a653]'}`}
            style={
              cssColor(content.buttonColor)
                ? { backgroundColor: cssColor(content.buttonColor) }
                : undefined
            }
          >
            {String(content.buttonText || 'Register for free')} ↓
          </a>
        </div>
      </div>
    </section>
  )
}

function BlockContent({
  block,
  isPreview = false,
  webinar,
  availableBlockIds,
  onReplaceImage,
  onActivateImage,
}: {
  block: FunnelBlock
  isPreview?: boolean
  webinar: WebinarContext
  availableBlockIds: Set<string>
  onReplaceImage?: (file: File) => Promise<void>
  onActivateImage?: () => void
}) {
  const { t } = useTranslation('funnels')
  const content = (block.content as Record<string, unknown>) || {}
  const common = isPreview ? 'p-6 rounded-lg' : 'p-4'

  switch (block.block_type) {
    case 'webinar_hero':
      return (
        <WebinarHero
          block={block}
          content={content}
          webinar={webinar}
          availableBlockIds={availableBlockIds}
          isPreview={isPreview}
          onReplaceImage={onReplaceImage}
          onActivateImage={onActivateImage}
        />
      )
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
      const desktopWidth = Math.min(
        100,
        Math.max(25, Number(content.widthDesktop ?? 100)),
      )
      const mobileWidth = Math.min(
        100,
        Math.max(25, Number(content.widthMobile ?? 100)),
      )
      const imageStyle = {
        '--funnel-image-desktop-width': `${desktopWidth}%`,
        '--funnel-image-mobile-width': `${mobileWidth}%`,
      } as React.CSSProperties
      return (
        <div className={common}>
          {url ? (
            <img
              src={url}
              alt={String(content.alt || '')}
              style={imageStyle}
              className="mx-auto h-auto w-[var(--funnel-image-mobile-width)] max-w-full rounded-lg object-contain sm:w-[var(--funnel-image-desktop-width)]"
            />
          ) : onReplaceImage ? (
            <EditorImagePicker
              className="bg-muted text-muted-foreground flex aspect-video items-center justify-center overflow-hidden rounded-lg"
              label={t('heroPhotoChoose', { defaultValue: 'Choose a photo' })}
              onFile={onReplaceImage}
              onActivate={onActivateImage}
            >
              <ImageIcon className="h-12 w-12" />
            </EditorImagePicker>
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
          {typeof content.title === 'string' && content.title.trim() ? (
            <Rich
              html={content.title}
              fallback=""
              className="mb-5 text-center text-2xl font-bold"
            />
          ) : null}
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
    case 'waiting_room_system':
      return (
        <WaitingRoomContent
          webinarSlug={webinar.webinarSlug}
          funnelSlug={webinar.funnelSlug}
          token={
            typeof window === 'undefined'
              ? null
              : new URLSearchParams(window.location.search).get('token')
          }
          isPreview={isPreview}
        />
      )
    case 'speaker': {
      const photo = safePublicUrl(content.imageUrl, '')
      const portrait = photo ? (
        <img
          src={photo}
          alt={String(content.imageAlt || content.name || '')}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <User className="text-muted-foreground h-10 w-10" />
        </span>
      )
      return (
        <div className={common}>
          <div className="mx-auto flex max-w-xl items-center gap-4">
            {onReplaceImage ? (
              <EditorImagePicker
                className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-200"
                label={
                  photo
                    ? t('heroPhotoReplace', { defaultValue: 'Replace photo' })
                    : t('heroPhotoChoose', { defaultValue: 'Choose a photo' })
                }
                onFile={onReplaceImage}
                onActivate={onActivateImage}
              >
                {portrait}
              </EditorImagePicker>
            ) : (
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-200">
                {portrait}
              </div>
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
    case 'cta': {
      const buttonColor = cssColor(content.buttonColor)
      return (
        <div className={common}>
          <div className="text-center">
            {typeof content.title === 'string' && content.title.trim() ? (
              <Rich
                html={content.title}
                fallback=""
                className="text-2xl font-bold"
              />
            ) : null}
            {typeof content.subtitle === 'string' && content.subtitle.trim() ? (
              <Rich
                html={content.subtitle}
                fallback=""
                className="mx-auto mt-2 max-w-xl text-sm opacity-80"
              />
            ) : null}
            <a
              href={safePublicUrl(content.url)}
              className={`mt-5 inline-block rounded-full px-8 py-3 font-semibold ${buttonColor ? 'text-white' : 'bg-primary text-primary-foreground'}`}
              style={buttonColor ? { backgroundColor: buttonColor } : undefined}
            >
              <Rich html={content.text} fallback="Get access now" />
            </a>
          </div>
        </div>
      )
    }
    case 'offer':
      return (
        <div className={common}>
          <Offer content={content} />
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
  funnelSlug,
  webinarSlug,
  webinarScheduledAt,
  webinarRegistrationMethod,
  webinarAccessMode,
  webinarPriceCents,
  availableBlockIds = [],
  onReplaceImage,
  onActivateImage,
}: {
  block: FunnelBlock
  isPreview?: boolean
  webinarId?: string | null
  funnelSlug?: string | null
  webinarSlug?: string | null
  webinarScheduledAt?: string | null
  webinarRegistrationMethod?: 'email' | 'telegram' | 'both' | null
  webinarAccessMode?: string | null
  webinarPriceCents?: number | null
  availableBlockIds?: string[]
  onReplaceImage?: (file: File) => Promise<void>
  onActivateImage?: () => void
}) {
  const sticky =
    block.block_type === 'cta' && block.settings?.sticky_mobile === true
  return (
    <div
      id={`funnel-block-${block.id}`}
      className={
        sticky
          ? 'sticky bottom-0 z-40 overflow-hidden rounded-lg md:static'
          : 'overflow-hidden rounded-lg'
      }
      style={{
        ...backgroundStyle(block.settings as Record<string, unknown>),
        ...(cssColor(
          (block.settings as Record<string, unknown> | undefined)?.text_color,
        )
          ? {
              color: cssColor(
                (block.settings as Record<string, unknown>).text_color,
              ),
            }
          : {}),
      }}
    >
      <BlockContent
        block={block}
        isPreview={isPreview}
        availableBlockIds={new Set(availableBlockIds)}
        onReplaceImage={onReplaceImage}
        onActivateImage={onActivateImage}
        webinar={{
          webinarId,
          funnelSlug,
          webinarSlug,
          webinarScheduledAt,
          webinarRegistrationMethod,
          webinarAccessMode,
          webinarPriceCents,
        }}
      />
    </div>
  )
}
