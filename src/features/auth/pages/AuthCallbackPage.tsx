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
    let authListener: { subscription: { unsubscribe: () => void } } | null =
      null

    const finish = (target: string) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (authListener) authListener.subscription.unsubscribe()
      if (isActive) navigate(target, { replace: true })
    }

    const fail = (reason: string, details?: unknown) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (authListener) authListener.subscription.unsubscribe()

      console.error('[AuthCallback] failed:', reason, details)
      if (isActive) {
        setErrorMessage(reason)
        setStatus('error')
      }
    }

    console.log('[AuthCallback] mount', {
      hasAccessToken: window.location.hash.includes('access_token'),
      hasCode: window.location.search.includes('code='),
    })

    authListener = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthCallback] auth event', { event, hasSession: !!session })
      if (event === 'SIGNED_IN' && session) {
        finish('/dashboard')
      }
    }).data

    async function handleCallback() {
      try {
        // PKCE path (if Supabase is configured for it server-side).
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)
          if (!isActive || resolvedRef.current) return
          if (exchangeError) {
            fail(exchangeError.message)
            return
          }
          finish('/dashboard')
          return
        }

        // Implicit OAuth path: token is in URL hash.
        // Supabase auto-extracts it, but we also force-extract it if needed.
        const hashParams = new URLSearchParams(window.location.hash.slice(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? '',
          })

          console.log('[AuthCallback] setSession result', {
            error: setError?.message,
          })
          if (!isActive || resolvedRef.current) return
          if (setError) {
            fail(setError.message)
            return
          }
          finish('/dashboard')
          return
        }

        // No code and no access_token: poll getSession briefly as a last resort.
        for (let attempt = 0; attempt < 20; attempt++) {
          const { data, error } = await supabase.auth.getSession()
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

    // Start after a small delay so the SIGNED_IN listener is attached first.
    const timeoutId = setTimeout(handleCallback, 50)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
      if (authListener) authListener.subscription.unsubscribe()
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
        <p className="text-muted-foreground max-w-md text-xs break-words whitespace-pre-wrap">
          {errorMessage}
        </p>
      )}
      <Button onClick={() => navigate('/login', { replace: true })}>
        {t('backToLogin')}
      </Button>
    </div>
  )
}
