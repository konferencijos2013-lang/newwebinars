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
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession()
        if (!isActive) return

        if (sessionData.session && !sessionError) {
          navigate('/dashboard', { replace: true })
          return
        }

        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (!code) {
          setStatus('error')
          return
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!isActive) return

        if (error) {
          setStatus('error')
          return
        }

        navigate('/dashboard', { replace: true })
      } catch {
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
