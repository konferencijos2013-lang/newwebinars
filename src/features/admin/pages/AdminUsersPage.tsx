import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Spinner } from '@/components/ui/Spinner'
import { fetchAdminUsers, type AdminUserRow } from '@/features/admin/api/admin'

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    fetchAdminUsers()
      .then((data) => {
        setUsers(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Sistemos vartotojai"
        subtitle="Visi platformos vartotojai ir jų klientų paskyros."
      />
      {state === 'loading' ? <Loading /> : null}
      {state === 'error' ? <Error /> : null}
      {state === 'ready' ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left">
              <tr>
                <th className="p-3">Vartotojas</th>
                <th className="p-3">Platformos rolė</th>
                <th className="p-3">Paskyros</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="p-3">
                    <p className="font-medium">{user.full_name ?? '—'}</p>
                    <p className="text-muted-foreground text-xs">
                      {user.email ?? '—'}
                    </p>
                  </td>
                  <td className="p-3">
                    {user.role === 'admin' ? 'Administratorius' : 'Vartotojas'}
                  </td>
                  <td className="p-3">
                    {user.accounts_count ? user.account_names.join(', ') : '—'}
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

export function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div>
      <Link
        to="/admin"
        className="text-primary text-sm font-medium hover:underline"
      >
        ← Administravimas
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
    </div>
  )
}
export function Loading() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
export function Error() {
  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 text-sm">
      Nepavyko įkelti duomenų.
    </div>
  )
}
