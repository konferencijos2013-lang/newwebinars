import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    const hash = window.location.hash

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          navigate('/webinars', { replace: true })
        } else if (hash) {
          return supabase.auth
            .exchangeCodeForSession(hash)
            .then(() => navigate('/webinars', { replace: true }))
        }
        setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [navigate])

  if (status === 'loading') {
    return <p className="p-8 text-center">{t('loading')}</p>
  }

  return <p className="p-8 text-center">{t('signIn')}</p>
}
