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
  const resolvedRef = useRef(false)

  // #region helper: send debug log
  const log = (id: string, message: string, data: Record<string, unknown> = {}) => {
    fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
      body: JSON.stringify({
        sessionId: '85756a',
        id,
        runId: 'initial',
        hypothesisId: 'B',
        location: 'src/features/auth/pages/AuthCallbackPage.tsx',
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }
  // #endregion

  useEffect(() => {
    let isActive = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (target: string) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (isActive) {
        log('log_callback_finish', 'Finishing callback', { target })
        navigate(target, { replace: true })
      }
    }

    const fail = (reason: string) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      log('log_callback_fail', 'Callback failed', { reason })
      if (isActive) {
        setStatus('error')
      }
    }

    log('log_callback_mount', 'Callback page mounted', {
      hasAccessToken: window.location.hash.includes('access_token'),
      hasCode: window.location.search.includes('code='),
    })

    // Listen for the automatic session recovery from the URL hash.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        log('log_callback_auth_event', 'Auth state change', {
          event,
          hasSession: !!session,
        })
        if (event === 'SIGNED_IN' && session) {
          finish('/dashboard')
        }
      }
    )

    // Fallback: if auth change already fired before listener was attached,
    // try reading the current session directly.
    const attemptRecovery = async () => {
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession()
        log('log_callback_get_session', 'getSession result', {
          hasSession: !!sessionData.session,
          error: sessionError ? sessionError.message : null,
        })
        if (!isActive || resolvedRef.current) return

        if (sessionData.session && !sessionError) {
          finish('/dashboard')
          return
        }

        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          log('log_callback_exchange_result', 'exchangeCodeForSession result', {
            error: error ? error.message : null,
          })
          if (!isActive || resolvedRef.current) return
          if (error) {
            fail(error.message)
            return
          }
          finish('/dashboard')
          return
        }

        // No token and no code -> show error.
        fail('no_session_or_code')
      } catch (err) {
        log('log_callback_exception', 'Recovery exception', {
          error: String(err),
        })
        fail('exception')
      }
    }

    // Give the implicit hash recovery a short moment to fire the SIGNED_IN event
    // before we fall back to manual recovery. 5s is generous for slow networks.
    timeoutId = setTimeout(attemptRecovery, 300)

    return () => {
      isActive = false
      if (timeoutId) clearTimeout(timeoutId)
      authListener.subscription.unsubscribe()
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
      <Button onClick={() => navigate('/login', { replace: true })}>
        {t('backToLogin')}
      </Button>
    </div>
  )
}
