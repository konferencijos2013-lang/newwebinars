import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'

type AffiliateDashboard = {
  status: 'none' | 'ready'
  name?: string
  code?: string
  clicks?: number
  signups?: number
  conversions?: number
  earned_cents?: number
  payable_cents?: number
  commission_rate_bps?: number
}

const money = new Intl.NumberFormat('lt-LT', {
  style: 'currency',
  currency: 'EUR',
})

function euros(cents: number | undefined) {
  return money.format((cents ?? 0) / 100)
}

export function AffiliatePage() {
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    let active = true
    void supabase.rpc('get_my_affiliate_dashboard').then(({ data, error }) => {
      if (!active) return
      if (error) {
        setStatus('error')
        return
      }
      setDashboard((data ?? { status: 'none' }) as AffiliateDashboard)
      setStatus('ready')
    })
    return () => {
      active = false
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardTitle>Partnerio duomenų nepavyko įkelti</CardTitle>
        </Card>
      </div>
    )
  }

  if (!dashboard || dashboard.status !== 'ready') {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">Partnerio kabinetas</h1>
        <Card className="mt-6">
          <CardTitle>Ši paskyra dar nėra patvirtintas partneris</CardTitle>
          <CardDescription className="mt-2">
            Paraišką galima pateikti viešame partnerių puslapyje. Kai
            administratorius ją patvirtins, čia matysite paspaudimus,
            registracijas ir uždarbį. Prisijunkite tuo pačiu el. paštu, kurį
            nurodėte paraiškoje.
          </CardDescription>
          <Link
            className="text-primary mt-4 inline-block text-sm font-medium"
            to="/partners"
          >
            Pateikti paraišką
          </Link>
        </Card>
      </div>
    )
  }

  const link = `${window.location.origin}/r/${dashboard.code}`

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Partnerio kabinetas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {dashboard.name} · komisija {(dashboard.commission_rate_bps ?? 0) / 100}%
        </p>
      </div>
      <Card>
        <CardTitle className="text-base">Jūsų nuoroda</CardTitle>
        <CardDescription className="mt-2 break-all">{link}</CardDescription>
      </Card>
      <div className="mt-6 grid gap-6 sm:grid-cols-4">
        <Card>
          <CardTitle>Paspaudimai</CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {dashboard.clicks ?? 0}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Registracijos</CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {dashboard.signups ?? 0}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Apmokėjimai</CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {dashboard.conversions ?? 0}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Uždarbis</CardTitle>
          <CardDescription className="mt-2 text-2xl font-semibold">
            {euros(dashboard.earned_cents)}
          </CardDescription>
          <p className="text-muted-foreground mt-2 text-xs">
            Mokėtina suma: {euros(dashboard.payable_cents)}
          </p>
        </Card>
      </div>
    </div>
  )
}
