import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    void supabase
      .rpc('accept_account_invitation', { p_token: token })
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) {
          const message = requestError.message
          setError(
            message.includes('INVITE_EMAIL_MISMATCH')
              ? 'Prisijunkite tuo el. paštu, kuriam skirtas pakvietimas.'
              : message.includes('INVITE_EXPIRED')
                ? 'Pakvietimas nebegalioja.'
                : message.includes('PLAN_TEAM_MEMBER_LIMIT_EXCEEDED')
                  ? 'Komandoje nebėra laisvų vietų.'
                  : 'Pakvietimo nepavyko priimti.',
          )
          setStatus('error')
          return
        }
        localStorage.setItem('newwebinars-account', String(data))
        window.location.assign('/dashboard')
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="text-center">
        {status === 'loading' ? <Spinner className="mx-auto h-8 w-8" /> : null}
        {status === 'error' ? (
          <>
            <CardTitle>Pakvietimas nepriimtas</CardTitle>
            <CardDescription className="mt-2">{error}</CardDescription>
          </>
        ) : null}
      </Card>
    </div>
  )
}
