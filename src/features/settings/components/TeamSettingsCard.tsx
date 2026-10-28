import { useCallback, useEffect, useState } from 'react'
import { Copy, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'

type TeamRow = {
  kind: 'member' | 'invite'
  id: string
  email: string | null
  role: string
  expires_at: string | null
}

const roleLabel: Record<string, string> = {
  owner: 'Savininkas',
  admin: 'Administratorius',
  host: 'Vedėjas',
  viewer: 'Stebėtojas',
}

export function TeamSettingsCard({
  accountId,
  canManage,
}: {
  accountId: string
  canManage: boolean
}) {
  const [rows, setRows] = useState<TeamRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'host' | 'viewer'>('host')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc('list_account_team', {
      p_account_id: accountId,
    })
    if (requestError) throw requestError
    setRows((data ?? []) as TeamRow[])
  }, [accountId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setInviteLink(null)
    const { data, error: requestError } = await supabase.rpc(
      'invite_account_member',
      { p_account_id: accountId, p_email: email, p_role: role },
    )
    setSaving(false)
    if (requestError) {
      const message = requestError.message
      setError(
        message.includes('PLAN_TEAM_MEMBER_LIMIT_EXCEEDED')
          ? 'Plane nebėra laisvų komandos vietų.'
          : message.includes('ALREADY_MEMBER')
            ? 'Šis žmogus jau yra komandoje.'
            : message.includes('INVALID_EMAIL')
              ? 'Įveskite teisingą el. paštą.'
              : message,
      )
      return
    }
    setInviteLink(`${window.location.origin}/invite/${data}`)
    setEmail('')
    await load()
  }

  async function revoke(id: string) {
    setError(null)
    const { error: requestError } = await supabase.rpc(
      'revoke_account_invitation',
      { p_invitation_id: id },
    )
    if (requestError) {
      setError(requestError.message)
      return
    }
    await load()
  }

  async function removeMember(userId: string) {
    setError(null)
    const { error: requestError } = await supabase.rpc('remove_account_member', {
      p_account_id: accountId,
      p_user_id: userId,
    })
    if (requestError) {
      setError(requestError.message)
      return
    }
    await load()
  }

  return (
    <Card className="mt-6">
      <div className="flex gap-3">
        <Users className="text-primary mt-0.5 h-5 w-5" />
        <div>
          <CardTitle>Komanda</CardTitle>
          <CardDescription className="mt-1">
            Pakvieskite vedėją arba stebėtoją. Nuorodą reikia perduoti tam pačiam
            el. paštui, kuriuo žmogus prisijungs.
          </CardDescription>
        </div>
      </div>

      {canManage ? (
        <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <div className="space-y-2">
            <Label htmlFor="team-email">El. paštas</Label>
            <Input
              id="team-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-role">Rolė</Label>
            <Select
              id="team-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as 'host' | 'viewer')
              }
            >
              <option value="host">Vedėjas</option>
              <option value="viewer">Stebėtojas</option>
            </Select>
          </div>
          <Button className="self-end" type="submit" isLoading={saving}>
            Pakviesti
          </Button>
        </form>
      ) : null}

      {inviteLink ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <span className="min-w-0 flex-1 break-all">{inviteLink}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(inviteLink)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Kopijuoti
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="mt-5 space-y-2">
        {rows.map((row) => (
          <div
            key={`${row.kind}-${row.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">{row.email ?? 'Be el. pašto'}</p>
              <p className="text-muted-foreground">
                {roleLabel[row.role] ?? row.role}
                {row.kind === 'invite' ? ' · laukia prisijungimo' : ''}
              </p>
            </div>
            {canManage && row.kind === 'invite' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void revoke(row.id)}
              >
                Atšaukti
              </Button>
            ) : null}
            {canManage && row.kind === 'member' && row.role !== 'owner' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void removeMember(row.id)}
              >
                Pašalinti
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
