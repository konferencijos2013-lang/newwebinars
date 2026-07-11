import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export function AuthCallbackPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    let isActive = true

    async function handleCallback() {
      try {
        const hash = window.location.hash
        const search = window.location.search

        // #region agent log
        fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
          body: JSON.stringify({
            sessionId: '85756a',
            id: 'log_callback_start',
            runId: 'initial',
            hypothesisId: 'B',
            location: 'src/features/auth/pages/AuthCallbackPage.tsx:16',
            message: 'AuthCallbackPage handleCallback started',
            data: {
              hasHash: hash.includes('access_token'),
              hasCode: search.includes('code='),
              pathname: window.location.pathname,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession()
        if (!isActive) return

        if (sessionData.session && !sessionError) {
          // #region agent log
          fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
            body: JSON.stringify({
              sessionId: '85756a',
              id: 'log_callback_session_exists',
              runId: 'initial',
              hypothesisId: 'B',
              location: 'src/features/auth/pages/AuthCallbackPage.tsx:18',
              message: 'Session already exists from hash',
              data: {},
              timestamp: Date.now(),
            }),
          }).catch(() => {})
          // #endregion
          navigate('/dashboard', { replace: true })
          return
        }

        const params = new URLSearchParams(search)
        const code = params.get('code')

        if (!code) {
          // #region agent log
          fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
            body: JSON.stringify({
              sessionId: '85756a',
              id: 'log_callback_no_code',
              runId: 'initial',
              hypothesisId: 'B',
              location: 'src/features/auth/pages/AuthCallbackPage.tsx:27',
              message: 'No code in URL',
              data: {},
              timestamp: Date.now(),
            }),
          }).catch(() => {})
          // #endregion
          setStatus('error')
          return
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!isActive) return

        if (error) {
          // #region agent log
          fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
            body: JSON.stringify({
              sessionId: '85756a',
              id: 'log_callback_exchange_error',
              runId: 'initial',
              hypothesisId: 'B',
              location: 'src/features/auth/pages/AuthCallbackPage.tsx:35',
              message: 'exchangeCodeForSession error',
              data: { error: error.message },
              timestamp: Date.now(),
            }),
          }).catch(() => {})
          // #endregion
          setStatus('error')
          return
        }

        navigate('/dashboard', { replace: true })
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
          body: JSON.stringify({
            sessionId: '85756a',
            id: 'log_callback_exception',
            runId: 'initial',
            hypothesisId: 'D',
            location: 'src/features/auth/pages/AuthCallbackPage.tsx:44',
            message: 'Callback exception',
            data: { error: String(err) },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        if (!isActive) return
        setStatus('error')
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
      <Button onClick={() => navigate('/login', { replace: true })}>
        {t('backToLogin')}
      </Button>
    </div>
  )
}
