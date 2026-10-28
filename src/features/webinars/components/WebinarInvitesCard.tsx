import { useCallback, useEffect, useState } from 'react'
import { Mail, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'

type Invite = { id: string; email: string; created_at: string }

export function WebinarInvitesCard({ webinarId }: { webinarId: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: requestError } = await supabase
      .from('webinar_invites')
      .select('id, email, created_at')
      .eq('webinar_id', webinarId)
      .order('created_at', { ascending: false })
    if (requestError) throw requestError
    setInvites((data ?? []) as Invite[])
  }, [webinarId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function addInvite(event: React.FormEvent) {
    event.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Įveskite teisingą el. paštą.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: requestError } = await supabase.from('webinar_invites').insert({
      webinar_id: webinarId,
      email: normalized,
    })
    setSaving(false)
    if (requestError) {
      setError(
        requestError.message.includes('duplicate')
          ? 'Šis el. paštas jau pakviestas.'
          : requestError.message,
      )
      return
    }
    setEmail('')
    await load()
  }

  async function removeInvite(id: string) {
    setError(null)
    const { error: requestError } = await supabase
      .from('webinar_invites')
      .delete()
      .eq('id', id)
    if (requestError) {
      setError(requestError.message)
      return
    }
    setInvites((current) => current.filter((invite) => invite.id !== id))
  }

  return (
    <Card className="mt-6">
      <div className="flex gap-3">
        <Mail className="text-primary mt-0.5 h-5 w-5" />
        <div>
          <CardTitle>Pakviesti dalyviai</CardTitle>
          <CardDescription className="mt-1">
            Registruotis galės tik šie el. paštai. Telegram registracija šiam
            režimui nenaudojama.
          </CardDescription>
        </div>
      </div>
      <form onSubmit={addInvite} className="mt-5 flex flex-wrap gap-3">
        <div className="min-w-64 flex-1 space-y-2">
          <Label htmlFor="invite-email">El. paštas</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vardas@imone.lt"
          />
        </div>
        <Button className="self-end" type="submit" isLoading={saving}>
          Pridėti
        </Button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="mt-4 space-y-2">
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">Pakvietimų dar nėra.</p>
        ) : (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <span className="text-sm">{invite.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void removeInvite(invite.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
