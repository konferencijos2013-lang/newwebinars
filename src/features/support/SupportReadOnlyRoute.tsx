import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { useUser } from '@/features/auth/hooks/useUser'

export function SupportReadOnlyRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const { accountId } = useParams<{ accountId: string }>()
  const { status, user } = useUser()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (status !== 'authenticated' || user?.role !== 'admin' || !accountId)
      return
    let active = true
    supabase
      .rpc('start_support_view', { p_account_id: accountId })
      .then(({ error }) => {
        if (!active) return
        setState(error ? 'error' : 'ready')
      })
    return () => {
      active = false
    }
  }, [accountId, status, user?.role])

  if (status === 'loading' || state === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (status !== 'authenticated' || user?.role !== 'admin')
    return <Navigate to="/dashboard" replace />
  if (state === 'error') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8" />
        <h1 className="font-semibold">Nepavyko pradėti pagalbos peržiūros</h1>
        <p className="mt-2 text-sm">
          Patikrinkite, ar paskyra egzistuoja, ir bandykite dar kartą.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
