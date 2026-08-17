import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  fetchAdminPayments,
  fetchAdminSubscriptions,
  type AdminPaymentRow,
  type AdminSubscriptionRow,
} from '@/features/admin/api/admin'
import {
  Error,
  Loading,
  PageHeader,
} from '@/features/admin/pages/AdminUsersPage'

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('lt-LT').format(new Date(value)) : '—'

export function AdminBillingListPage() {
  const { view } = useParams()
  const isPayments = view === 'payments'
  const isPastDue = view === 'past-due'
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRow[]>([])
  const [payments, setPayments] = useState<AdminPaymentRow[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const request = isPayments
      ? fetchAdminPayments().then(setPayments)
      : fetchAdminSubscriptions(isPastDue ? 'past_due' : 'active').then(
          setSubscriptions,
        )
    request.then(() => setState('ready')).catch(() => setState('error'))
  }, [isPastDue, isPayments])
  const title = isPayments
    ? 'Mokėjimai'
    : isPastDue
      ? 'Vėluojantys mokėjimai'
      : 'Aktyvios prenumeratos'
  const subtitle = isPayments
    ? 'Stripe mokėjimų istorija, užregistruota sistemoje.'
    : isPastDue
      ? 'Prenumeratos, kurioms nepavyko apmokėjimas.'
      : 'Aktyvios ir bandomosios klientų prenumeratos.'
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      {state === 'loading' ? <Loading /> : null}
      {state === 'error' ? <Error /> : null}
      {state === 'ready' && isPayments ? (
        <PaymentsTable payments={payments} />
      ) : null}
      {state === 'ready' && !isPayments ? (
        <SubscriptionsTable subscriptions={subscriptions} />
      ) : null}
    </div>
  )
}
function AccountLink({
  id,
  name,
  slug,
}: {
  id: string
  name: string
  slug: string
}) {
  return (
    <Link
      className="text-primary font-medium hover:underline"
      to={`/admin/accounts/${id}`}
    >
      {name}
      <span className="text-muted-foreground ml-1 text-xs">{slug}</span>
    </Link>
  )
}
function SubscriptionsTable({
  subscriptions,
}: {
  subscriptions: AdminSubscriptionRow[]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left">
          <tr>
            <th className="p-3">Paskyra</th>
            <th className="p-3">Planas</th>
            <th className="p-3">Būsena</th>
            <th className="p-3">Galioja iki</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.length ? (
            subscriptions.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">
                  {item.account ? <AccountLink {...item.account} /> : '—'}
                </td>
                <td className="p-3">{item.plan?.name ?? '—'}</td>
                <td className="p-3">{item.status}</td>
                <td className="p-3">{formatDate(item.current_period_end)}</td>
              </tr>
            ))
          ) : (
            <Empty colSpan={4} />
          )}
        </tbody>
      </table>
    </div>
  )
}
function PaymentsTable({ payments }: { payments: AdminPaymentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left">
          <tr>
            <th className="p-3">Paskyra</th>
            <th className="p-3">Suma</th>
            <th className="p-3">Būsena</th>
            <th className="p-3">Apmokėta</th>
          </tr>
        </thead>
        <tbody>
          {payments.length ? (
            payments.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">
                  {item.account ? <AccountLink {...item.account} /> : '—'}
                </td>
                <td className="p-3">
                  {(item.amount_cents / 100).toFixed(2)}{' '}
                  {item.currency.toUpperCase()}
                </td>
                <td className="p-3">{item.status}</td>
                <td className="p-3">{formatDate(item.paid_at)}</td>
              </tr>
            ))
          ) : (
            <Empty colSpan={4} />
          )}
        </tbody>
      </table>
    </div>
  )
}
function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted-foreground p-6 text-center">
        Duomenų nėra.
      </td>
    </tr>
  )
}
