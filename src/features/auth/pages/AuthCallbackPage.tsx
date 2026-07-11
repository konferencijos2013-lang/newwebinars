import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export function AuthCallbackPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const resolvedRef = useRef(false)

  useEffect(() => {
    let isActive = true

    const finish = (target: string) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (isActive) navigate(target, { replace: true })
    }

    const fail = (reason: string, details?: unknown) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      // eslint-disable-next-line no-console
      console.error('[AuthCallback] failed:', reason, details)
      if (isActive) {
        setErrorMessage(reason)
        setStatus('error')
      }
    }

    // eslint-disable-next-line no-console
    console.log('[AuthCallback] mount', {
      hasAccessToken: window.location.hash.includes('access_token'),
      hasCode: window.location.search.includes('code='),
    })

    async function handleCallback() {
      try {
        // If Supabase returned a PKCE code, exchange it immediately.
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (!isActive || resolvedRef.current) return
          if (exchangeError) {
            fail(exchangeError.message)
            return
          }
          finish('/dashboard')
          return
        }

        // Implicit OAuth flow: token is in the URL hash (#access_token=...).
        // Supabase client extracts it automatically, but asynchronously.
        // Retry getSession a few times with a short delay.
        for (let attempt = 0; attempt < 20; attempt++) {
          const { data, error } = await supabase.auth.getSession()
          // eslint-disable-next-line no-console
          console.log('[AuthCallback] getSession attempt', attempt, {
            hasSession: !!data.session,
            error: error?.message,
          })
          if (!isActive || resolvedRef.current) return
          if (data.session && !error) {
            finish('/dashboard')
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 100))
          if (!isActive || resolvedRef.current) return
        }

        fail('no_session_or_code')
      } catch (err) {
        fail('exception', err)
      }
    }

    handleCallback()

    return () => {
      isActive = false
    }
  }, [navigate])

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Spinner className="h-8 w-8" />
        <p className="text-muted-foreground text-sm">{t('loggingIn')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-destructive">{t('authError')}</p>
      {errorMessage && (
        <p className="text-muted-foreground max-w-md whitespace-pre-wrap break-words text-xs">
          {errorMessage}
        </p>
      )}
      <Button onClick={() => navigate('/login', { replace: true })}>
        {t('backToLogin')}
      </Button>
    </div>
  )
}
