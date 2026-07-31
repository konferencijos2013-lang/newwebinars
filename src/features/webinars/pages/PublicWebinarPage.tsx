import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Calendar, Clock, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import {
  fetchWebinarByHostname,
  fetchWebinarBySlug,
  registerForWebinar,
} from '@/features/webinars/api/public'
import type { Webinar } from '@/shared/database.types'

export function PublicWebinarPage() {
  const { t } = useTranslation('public')
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationToken, setRegistrationToken] = useState<string | null>(
    null,
  )
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    if (!slug) return
    let isActive = true

    const isPlatformHost =
      /^(?:www\.)?newwebinars\.com(?::\d+)?$/i.test(window.location.host) ||
      /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(window.location.host)
    const request = isPlatformHost
      ? fetchWebinarBySlug(slug)
      : fetchWebinarByHostname(window.location.hostname, slug)

    request
      .then((w) => {
        if (!isActive) return
        setWebinar(w)
        setStatus('ready')
      })
      .catch(() => {
        if (!isActive) return
        setStatus('error')
      })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isActive) return
      setIsLoggedIn(!!session?.user)
    })

    return () => {
      isActive = false
    }
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!webinar) return
    setIsSubmitting(true)

    try {
      const reg = await registerForWebinar({
        webinar_id: webinar.id,
        email: email.trim(),
        full_name: fullName.trim() || null,
        referral_code: searchParams.get('ref') ?? undefined,
        referrer_url:
          typeof window !== 'undefined' ? window.location.href : null,
      })
      setRegistrationToken(reg.access_token)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !webinar) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold">{t('errorNotFound')}</h1>
      </div>
    )
  }

  if (registrationToken) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Card>
          <CardTitle>{t('registeredTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('registeredDescription')}
          </CardDescription>
          <Button
            className="mt-6"
            onClick={() =>
              (window.location.href = `/${webinar.slug}/waiting-room?token=${registrationToken}`)
            }
          >
            {t('enterWaitingRoom')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="text-center">
        <h1 className="text-foreground text-4xl font-bold tracking-tight">
          {webinar.title}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          {webinar.description}
        </p>
      </div>

      <div className="mt-8 flex justify-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          {webinar.scheduled_at
            ? new Date(webinar.scheduled_at).toLocaleString()
            : t('scheduleOnDemand')}
        </span>
        {webinar.duration_minutes ? (
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {webinar.duration_minutes} {t('durationMinutes')}
          </span>
        ) : null}
        <span className="flex items-center gap-1 capitalize">
          {webinar.access_mode === 'public' ? (
            <Globe className="h-4 w-4" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {webinar.access_mode}
        </span>
      </div>

      {isLoggedIn ? (
        <Card className="mt-10 text-center">
          <CardTitle>{t('hostPreviewTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('hostPreviewDescription')}
          </CardDescription>
          <Button
            className="mt-6"
            onClick={() =>
              (window.location.href = `/${webinar.slug}/room?preview=1`)
            }
          >
            {t('openRoomPreview')}
          </Button>
        </Card>
      ) : (
        <Card className="mt-10">
          <CardTitle>{t('register')}</CardTitle>
          <CardDescription className="mt-2">
            {t('registerDescription')}
          </CardDescription>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('fullName')}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <Button type="submit" isLoading={isSubmitting} className="w-full">
              {isSubmitting ? t('registering') : t('register')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
