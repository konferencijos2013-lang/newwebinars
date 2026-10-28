import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { supabase } from '@/lib/supabase'

type AttendanceRow = {
  id: string
  webinar_id: string
  email: string | null
  full_name: string | null
  registered_at: string
  entered_waiting_room_at: string | null
  joined_webinar_at: string | null
  watch_time_seconds: number
  offer_clicked_at: string | null
  paid_at: string | null
}

function formatWatch(seconds: number) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  if (hours > 0) return `${hours} val. ${minutes} min.`
  if (minutes > 0) return `${minutes} min. ${rest} s`
  return `${rest} s`
}

export function AnalyticsPage() {
  const { t } = useTranslation('webinars')
  const account = useAccount()
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    if (account.status !== 'ready') return
    let active = true
    void (async () => {
      const { data: webinars, error: webinarError } = await supabase
        .from('webinars')
        .select('id, title')
        .eq('account_id', account.account.id)
      if (!active) return
      if (webinarError) {
        setStatus('error')
        return
      }
      const list = webinars ?? []
      setTitles(Object.fromEntries(list.map((webinar) => [webinar.id, webinar.title])))
      if (list.length === 0) {
        setRows([])
        setStatus('ready')
        return
      }
      const { data, error } = await supabase
        .from('registrations')
        .select(
          'id, webinar_id, email, full_name, registered_at, entered_waiting_room_at, joined_webinar_at, watch_time_seconds, offer_clicked_at, paid_at',
        )
        .in(
          'webinar_id',
          list.map((webinar) => webinar.id),
        )
        .order('registered_at', { ascending: false })
        .limit(500)
      if (!active) return
      if (error) {
        setStatus('error')
        return
      }
      setRows((data ?? []) as AttendanceRow[])
      setStatus('ready')
    })()
    return () => {
      active = false
    }
  }, [account.status, account.account?.id])

  const summary = useMemo(() => {
    const joined = rows.filter((row) => row.joined_webinar_at).length
    const clicked = rows.filter((row) => row.offer_clicked_at).length
    const watched = rows.reduce((sum, row) => sum + (row.watch_time_seconds || 0), 0)
    return {
      registrations: rows.length,
      joined,
      clicked,
      averageWatch: rows.length === 0 ? 0 : Math.round(watched / rows.length),
    }
  }, [rows])

  if (account.status === 'loading' || status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('analytics.title', 'Analitika')}
        </h1>
        <p className="text-muted-foreground text-sm">
          Kas užsiregistravo, įėjo į kambarį, kiek žiūrėjo ir ar paspaudė
          pasiūlymą.
        </p>
      </div>

      {status === 'error' ? (
        <Card>
          <CardTitle>Analitikos nepavyko įkelti</CardTitle>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-4">
            <Card>
              <CardTitle>Registracijos</CardTitle>
              <CardDescription className="mt-2 text-2xl font-semibold">
                {summary.registrations}
              </CardDescription>
            </Card>
            <Card>
              <CardTitle>Įėjo į kambarį</CardTitle>
              <CardDescription className="mt-2 text-2xl font-semibold">
                {summary.joined}
              </CardDescription>
            </Card>
            <Card>
              <CardTitle>Vidutinis žiūrėjimas</CardTitle>
              <CardDescription className="mt-2 text-2xl font-semibold">
                {formatWatch(summary.averageWatch)}
              </CardDescription>
            </Card>
            <Card>
              <CardTitle>Pasiūlymo paspaudimai</CardTitle>
              <CardDescription className="mt-2 text-2xl font-semibold">
                {summary.clicked}
              </CardDescription>
            </Card>
          </div>

          <Card className="mt-6 overflow-x-auto">
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Registracijų dar nėra. Jos atsiras, kai dalyvis užsiregistruos.
              </p>
            ) : (
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Dalyvis</th>
                    <th className="p-2 font-medium">Webinaras</th>
                    <th className="p-2 font-medium">Registracija</th>
                    <th className="p-2 font-medium">Laukiamasis</th>
                    <th className="p-2 font-medium">Kambarys</th>
                    <th className="p-2 font-medium">Žiūrėjo</th>
                    <th className="p-2 font-medium">Pasiūlymas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <p className="font-medium">
                          {row.full_name || 'Be vardo'}
                        </p>
                        <p className="text-muted-foreground">
                          {row.email || 'Telegram'}
                        </p>
                      </td>
                      <td className="p-2">{titles[row.webinar_id] ?? '—'}</td>
                      <td className="p-2">
                        {new Date(row.registered_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {row.entered_waiting_room_at ? 'Taip' : 'Ne'}
                      </td>
                      <td className="p-2">
                        {row.joined_webinar_at ? 'Taip' : 'Ne'}
                      </td>
                      <td className="p-2">
                        {formatWatch(row.watch_time_seconds || 0)}
                      </td>
                      <td className="p-2">
                        {row.offer_clicked_at ? 'Paspaudė' : '—'}
                        {row.paid_at ? ' · apmokėta' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
