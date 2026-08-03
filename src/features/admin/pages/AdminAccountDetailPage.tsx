import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchAdminAccountDetail,
  type AdminAccountDetail,
} from '@/features/admin/api/admin'

export function AdminAccountDetailPage() {
  const { accountId } = useParams()
  const [data, setData] = useState<AdminAccountDetail | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (accountId)
      fetchAdminAccountDetail(accountId)
        .then(setData)
        .catch(() => setError(true))
  }, [accountId])
  if (!data && !error)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (error || !data)
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 text-sm">
        Nepavyko įkelti paskyros.
      </div>
    )
  const { account, owner, members, subscription, payments, usage } = data
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        to="/admin/accounts"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Visos paskyros
      </Link>
      <div>
        <p className="text-primary text-sm font-semibold">Kliento paskyra</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {account.name}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {account.slug} · sukurta{' '}
          {new Intl.DateTimeFormat('lt-LT').format(
            new Date(account.created_at),
          )}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Savininkas</CardTitle>
          <CardDescription className="mt-3">
            {owner?.full_name ?? '—'}
            <br />
            {owner?.email ?? '—'}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Prenumerata</CardTitle>
          <CardDescription className="mt-3">
            {subscription?.status ?? 'Nėra aktyvios prenumeratos'}
            <br />
            {subscription?.current_period_end
              ? `Iki ${new Intl.DateTimeFormat('lt-LT').format(new Date(subscription.current_period_end))}`
              : '—'}
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Domenas</CardTitle>
          <CardDescription className="mt-3">
            {account.custom_domain ??
              account.public_subdomain ??
              'Nenustatytas'}
            <br />
            {account.custom_domain_status}
          </CardDescription>
        </Card>
      </div>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Komandos nariai</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="p-3">Vartotojas</th>
                <th className="p-3">Rolė</th>
                <th className="p-3">Prisijungė</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">
                      {member.profile?.full_name ?? '—'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {member.profile?.email ?? '—'}
                    </p>
                  </td>
                  <td className="p-3">{member.role}</td>
                  <td className="p-3">
                    {new Intl.DateTimeFormat('lt-LT').format(
                      new Date(member.joined_at),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <DataList
          title="Paskutiniai mokėjimai"
          items={payments.map(
            (payment) =>
              `${(payment.amount_cents / 100).toFixed(2)} ${payment.currency.toUpperCase()} · ${payment.status}`,
          )}
          empty="Mokėjimų nėra"
        />
        <DataList
          title="Paskutinis naudojimas"
          items={usage.map(
            (event) =>
              `${event.credit_type ?? event.scope} · ${event.quantity} · ${new Intl.DateTimeFormat('lt-LT').format(new Date(event.created_at))}`,
          )}
          empty="Naudojimo įvykių nėra"
        />
      </div>
    </div>
  )
}

function DataList({
  title,
  items,
  empty,
}: {
  title: string
  items: string[]
  empty: string
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <div className="divide-y rounded-lg border">
        {items.length ? (
          items.map((item, index) => (
            <p className="p-3 text-sm" key={`${item}-${index}`}>
              {item}
            </p>
          ))
        ) : (
          <p className="text-muted-foreground p-3 text-sm">{empty}</p>
        )}
      </div>
    </section>
  )
}
