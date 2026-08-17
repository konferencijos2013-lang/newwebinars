import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  AlertCircle,
  Building2,
  CreditCard,
  HandCoins,
  Users,
} from 'lucide-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchAdminOverview,
  type AdminOverview,
} from '@/features/admin/api/admin'

const money = new Intl.NumberFormat('lt-LT', {
  style: 'currency',
  currency: 'EUR',
})

export function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchAdminOverview()
      .then(setOverview)
      .catch(() => setError(true))
  }, [])

  if (!overview && !error)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (error)
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 text-sm">
        Nepavyko įkelti administravimo rodiklių.
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-primary text-sm font-semibold">
          Platformos valdymas
        </p>
        <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight">
          Administravimas
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Klientų paskyros, prenumeratos, naudojimas ir sistemos priežiūra.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Building2}
          label="Klientų paskyros"
          value={overview!.accounts_count}
          to="/admin/accounts"
        />
        <Metric
          icon={Users}
          label="Sistemos vartotojai"
          value={overview!.users_count}
          to="/admin/users"
        />
        <Metric
          icon={CreditCard}
          label="Aktyvios prenumeratos"
          value={overview!.paid_subscriptions_count}
          to="/admin/billing/subscriptions"
        />
        <Metric
          icon={AlertCircle}
          label="Vėluojantys mokėjimai"
          value={overview!.past_due_subscriptions_count}
          danger
          to="/admin/billing/past-due"
        />
      </div>
      <Metric
        icon={HandCoins}
        label="Partneriams mokėtina"
        value={money.format(overview!.affiliate_payable_cents / 100)}
        to="/admin/partners"
      />
      <Link
        to="/admin/billing/payments"
        className="focus:ring-primary block rounded-lg focus:ring-2 focus:outline-none"
      >
        <Card className="hover:bg-muted/40 transition-colors">
          <CardTitle>Gauti mokėjimai</CardTitle>
          <CardDescription className="mt-2">
            Sėkmingi mokėjimai, užregistruoti sistemoje. Atidaryti mokėjimų
            istoriją.
          </CardDescription>
          <p className="mt-5 text-3xl font-bold">
            {money.format(overview!.payments_cents / 100)}
          </p>
        </Card>
      </Link>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  danger?: boolean
  to: string
}) {
  return (
    <Link
      to={to}
      className="focus:ring-primary block rounded-lg focus:ring-2 focus:outline-none"
    >
      <Card className="hover:bg-muted/40 p-5 transition-colors">
        <Icon
          className={
            danger ? 'text-destructive h-5 w-5' : 'text-primary h-5 w-5'
          }
        />
        <p className="mt-4 text-2xl font-bold">{value}</p>
        <p className="text-muted-foreground mt-1 text-sm">{label}</p>
      </Card>
    </Link>
  )
}
