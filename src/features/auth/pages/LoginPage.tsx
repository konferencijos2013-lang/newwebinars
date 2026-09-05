import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Check, Mail, Play, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/features/auth/hooks/useUser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function safeReturnTo(value: string | null) {
  if (!value) return '/dashboard'
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return '/dashboard'
    if (url.pathname === '/dashboard' || url.pathname === '/webinars')
      return url.pathname
    if (url.pathname !== '/billing') return '/dashboard'
    const safe = new URLSearchParams()
    const plan = url.searchParams.get('plan')
    const interval = url.searchParams.get('interval')
    if (plan && /^[a-z0-9-]+$/.test(plan)) safe.set('plan', plan)
    if (interval === 'month' || interval === 'year')
      safe.set('interval', interval)
    return `/billing${safe.size ? `?${safe}` : ''}`
  } catch {
    return '/dashboard'
  }
}

function getRedirectTo(returnTo: string) {
  const url = new URL('/auth/callback', window.location.origin)
  url.searchParams.set('returnTo', returnTo)
  return url.toString()
}

export function LoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const { status } = useUser()

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false)
  const [isLoadingEmail, setIsLoadingEmail] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(returnTo, { replace: true })
    }
  }, [status, navigate, returnTo])

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (!isValidEmail(email)) {
      setEmailError(t('invalidEmail'))
      return
    }

    setEmailError(null)
    setIsLoadingEmail(true)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getRedirectTo(returnTo),
      },
    })

    setIsLoadingEmail(false)

    if (signInError) {
      setError(`${t('magicLinkError')} (${signInError.message})`)
      return
    }

    setMessage(t('magicLinkSent', { email }))
    setEmail('')
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsLoadingGoogle(true)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectTo(returnTo),
      },
    })

    setIsLoadingGoogle(false)

    if (oauthError) {
      setError(t('authError'))
    }
  }

  return (
    <div className="relative flex min-h-[calc(100svh-4rem)] items-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--color-primary)_18%,transparent),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(34,211,238,0.12),transparent_38%)]" />
      <div className="bg-card mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border shadow-[0_30px_90px_-35px_rgba(53,43,124,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-[#111326] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2.5 font-bold">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500">
                <Play className="h-4 w-4 fill-current" />
              </span>
              NewWebinars
            </div>
            <h2 className="mt-16 max-w-md text-4xl leading-tight font-bold tracking-[-0.04em]">
              {t('loginVisualTitle')}
            </h2>
            <p className="mt-5 max-w-md leading-7 text-white/55">
              {t('loginVisualSubtitle')}
            </p>
          </div>
          <div className="relative grid gap-3 text-sm text-white/75">
            {[t('loginBenefit1'), t('loginBenefit2'), t('loginBenefit3')].map(
              (item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
        <div className="p-6 sm:p-10 lg:p-14">
          <a
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            NewWebinars
          </a>
          <div className="mt-10 mb-8">
            <span className="text-primary inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              {t('secureAccess')}
            </span>
            <CardTitle className="mt-4 text-3xl tracking-tight">
              {t('loginTitle')}
            </CardTitle>
            <CardDescription className="mt-3 text-base leading-7">
              {t('loginSubtitle')}
            </CardDescription>
          </div>

          <div className="flex flex-col gap-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-xl"
              onClick={handleGoogleSignIn}
              isLoading={isLoadingGoogle}
              disabled={isLoadingEmail}
            >
              {!isLoadingGoogle && (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {t('continueWithGoogle')}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card text-muted-foreground px-3">
                  {t('or')}
                </span>
              </div>
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  {t('email')}
                </label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder={t('email')}
                  className="h-12 rounded-xl px-4"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoadingEmail}
                  aria-invalid={emailError ? 'true' : 'false'}
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && (
                  <p id="email-error" className="text-destructive mt-1 text-sm">
                    {emailError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl"
                isLoading={isLoadingEmail}
                disabled={isLoadingGoogle}
              >
                {!isLoadingEmail && (
                  <Mail className="h-4 w-4" aria-hidden="true" />
                )}
                {t('sendMagicLink')}
              </Button>
            </form>

            {message && (
              <div className="bg-muted text-foreground rounded-md p-3 text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="text-destructive rounded-md bg-red-50 p-3 text-sm dark:bg-red-950/30">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
