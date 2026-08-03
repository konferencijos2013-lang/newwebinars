import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchAdminAccounts,
  type AdminAccountRow,
} from '@/features/admin/api/admin'

function statusLabel(status: string | undefined) {
  if (!status) return 'Be prenumeratos'
  return (
    (
      {
        active: 'Aktyvi',
        trialing: 'Bandomoji',
        past_due: 'Vėluoja',
        canceled: 'Atšaukta',
        paused: 'Sustabdyta',
        incomplete: 'Neužbaigta',
      } as Record<string, string>
    )[status] ?? status
  )
}

export function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccountRow[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [submittedSearch, setSubmittedSearch] = useState('')

  useEffect(() => {
    fetchAdminAccounts(submittedSearch)
      .then((data) => {
        setAccounts(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [submittedSearch])
  const subtitle = useMemo(
    () => `${accounts.length} pask. šiame sąraše`,
    [accounts.length],
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-primary text-sm font-semibold">
          Platformos valdymas
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Paskyros ir vartotojai
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
      </div>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmittedSearch(search)
        }}
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ieškoti įmonės arba paskyros pavadinimo"
            className="border-input bg-background h-9 w-full rounded-md border pr-3 pl-9 text-sm"
          />
        </div>
        <Button type="submit" variant="outline">
          Ieškoti
        </Button>
      </form>
      {status === 'loading' ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 text-sm">
          Nepavyko įkelti paskyrų.
        </div>
      ) : null}
      {status === 'ready' ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">Paskyra</th>
                <th className="p-3 font-medium">Savininkas</th>
                <th className="p-3 font-medium">Plan as</th>
                <th className="p-3 font-medium">Nariai</th>
                <th className="p-3 font-medium">Sukurta</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{account.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {account.slug}
                    </p>
                  </td>
                  <td className="p-3">
                    <p>{account.owner?.full_name ?? '—'}</p>
                    <p className="text-muted-foreground text-xs">
                      {account.owner?.email ?? '—'}
                    </p>
                  </td>
                  <td className="p-3">
                    <span className="bg-muted rounded px-2 py-1 text-xs">
                      {statusLabel(account.subscription?.status)}
                    </span>
                  </td>
                  <td className="p-3">{account.members_count}</td>
                  <td className="text-muted-foreground p-3">
                    {new Intl.DateTimeFormat('lt-LT').format(
                      new Date(account.created_at),
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      className="text-primary text-sm font-medium hover:underline"
                      to={`/admin/accounts/${account.id}`}
                    >
                      Atidaryti
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
