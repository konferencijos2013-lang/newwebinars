import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/features/auth/hooks/useUser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function safeReturnTo(value: string | null) {
  if (!value) return '/dashboard'
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || url.pathname !== '/billing')
      return '/dashboard'
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

    console.log('[LoginPage] initiating Google OAuth', {
      redirectTo: getRedirectTo(returnTo),
    })

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectTo(returnTo),
      },
    })

    console.log('[LoginPage] signInWithOAuth result', {
      error: oauthError?.message,
    })

    setIsLoadingGoogle(false)

    if (oauthError) {
      setError(t('authError'))
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <CardTitle className="text-2xl">{t('loginTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('loginSubtitle')}
          </CardDescription>
        </div>

        <div className="flex flex-col gap-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
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
              <span className="bg-card text-muted-foreground px-2">or</span>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
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
              className="w-full"
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
      </Card>
    </div>
  )
}
