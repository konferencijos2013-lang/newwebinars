import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { unsubscribeEmailContact } from '@/features/settings/api/emailContacts'

export function EmailUnsubscribePage() {
  const { t } = useTranslation('mail')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'loading' | 'done' | 'invalid'>('loading')

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      setState('invalid')
      return
    }
    let active = true
    void unsubscribeEmailContact(token)
      .then((ok) => {
        if (active) setState(ok ? 'done' : 'invalid')
      })
      .catch(() => {
        if (active) setState('invalid')
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md text-center">
        {state === 'loading' ? (
          <Spinner className="mx-auto h-6 w-6" />
        ) : state === 'done' ? (
          <>
            <CardTitle>{t('unsubscribedTitle')}</CardTitle>
            <CardDescription className="mt-2">
              {t('unsubscribedDescription')}
            </CardDescription>
          </>
        ) : (
          <>
            <CardTitle>{t('invalidTitle')}</CardTitle>
            <CardDescription className="mt-2">
              {t('invalidDescription')}
            </CardDescription>
          </>
        )}
      </Card>
    </div>
  )
}
