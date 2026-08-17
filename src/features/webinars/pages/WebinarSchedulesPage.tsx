import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, CalendarClock, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import {
  createWebinarSchedule,
  createWebinarSession,
  deleteWebinarSchedule,
  fetchWebinar,
  fetchWebinarSchedules,
  fetchWebinarSessions,
} from '@/features/webinars/api/webinars'
import { supportPath, useSupportView } from '@/features/support/useSupportView'
import type {
  Webinar,
  WebinarSchedule,
  WebinarSession,
} from '@/shared/database.types'

type ScheduleKind = 'fixed' | 'recurring' | 'just_in_time' | 'on_demand'

const weekdayOptions = [
  ['1', 'Pirmadienis'],
  ['2', 'Antradienis'],
  ['3', 'Trečiadienis'],
  ['4', 'Ketvirtadienis'],
  ['5', 'Penktadienis'],
  ['6', 'Šeštadienis'],
  ['7', 'Sekmadienis'],
] as const

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatRule(rule: string | null) {
  if (!rule) return null
  try {
    const parsed = JSON.parse(rule) as { daysOfWeek?: number[]; time?: string }
    const days = (parsed.daysOfWeek ?? [])
      .map(
        (day) => weekdayOptions.find(([value]) => value === String(day))?.[1],
      )
      .filter(Boolean)
    return [days.join(', '), parsed.time].filter(Boolean).join(' · ')
  } catch {
    return rule
  }
}

export function WebinarSchedulesPage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const supportView = useSupportView()
  const path = (to: string) => supportPath(supportView?.basePath ?? null, to)
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [schedules, setSchedules] = useState<WebinarSchedule[]>([])
  const [sessions, setSessions] = useState<WebinarSession[]>([])
  const [kind, setKind] = useState<ScheduleKind>('fixed')
  const [startsAt, setStartsAt] = useState(() =>
    localInputValue(new Date(Date.now() + 60 * 60_000)),
  )
  const [endsAt, setEndsAt] = useState('')
  const [time, setTime] = useState('18:00')
  const [days, setDays] = useState<string[]>(['1'])
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vilnius',
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.starts_at),
    [sessions],
  )

  const load = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [nextWebinar, nextSchedules, nextSessions] = await Promise.all([
        fetchWebinar(id),
        fetchWebinarSchedules(id),
        fetchWebinarSessions(id),
      ])
      setWebinar(nextWebinar)
      setSchedules(nextSchedules)
      setSessions(nextSessions)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const toggleDay = (day: string) => {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    )
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!id || supportView) return
    setError(null)
    if (kind === 'recurring' && days.length === 0) {
      setError('Pasirinkite bent vieną savaitės dieną.')
      return
    }
    setIsSaving(true)
    try {
      const startIso = startsAt ? new Date(startsAt).toISOString() : null
      const endIso = endsAt ? new Date(endsAt).toISOString() : null
      const recurrenceRule =
        kind === 'recurring'
          ? JSON.stringify({ daysOfWeek: days.map(Number), time })
          : null
      await createWebinarSchedule({
        webinar_id: id,
        schedule_type: kind,
        starts_at:
          kind === 'on_demand' || kind === 'just_in_time' ? null : startIso,
        ends_at:
          kind === 'on_demand' || kind === 'just_in_time' ? null : endIso,
        recurrence_rule: recurrenceRule,
        timezone,
      })
      // A fixed schedule has a known occurrence now. Recurring and JIT occurrences
      // are materialised securely by the registration RPC when a visitor registers.
      if (kind === 'fixed' && startIso) {
        await createWebinarSession({
          webinar_id: id,
          starts_at: startIso,
          ends_at: endIso,
        })
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(scheduleId: string) {
    if (supportView || !window.confirm('Pašalinti šį grafiką?')) return
    try {
      await deleteWebinarSchedule(scheduleId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (!webinar)
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardTitle>{t('errorNotFound')}</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      </div>
    )

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate(path(`/webinars/${id}`))}
      >
        <ArrowLeft className="h-4 w-4" /> {t('cancel')}
      </Button>
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">{t('schedules')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {webinar.title}. Fiksuotas laikas sukuria konkretų seansą, o
          pasikartojantis evergreen – seansą kiekvienai naujai registracijai.
        </p>
      </div>
      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!supportView && (
        <Card className="mb-6">
          <CardTitle>{t('addSchedule')}</CardTitle>
          <CardDescription className="mt-1">
            Dalyviai ir priminimai bus priskiriami konkrečiam webinaro seansui.
          </CardDescription>
          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kind">{t('scheduleType')}</Label>
                <Select
                  id="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ScheduleKind)}
                >
                  <option value="fixed">{t('scheduleFixed')}</option>
                  <option value="recurring">{t('scheduleRecurring')}</option>
                  <option value="just_in_time">
                    {t('scheduleJustInTime')}
                  </option>
                  <option value="on_demand">{t('scheduleOnDemand')}</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">{t('timezone')}</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  required
                />
              </div>
            </div>
            {kind === 'fixed' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startsAt">{t('startsAt')}</Label>
                  <Input
                    id="startsAt"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endsAt">{t('endsAt')}</Label>
                  <Input
                    id="endsAt"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
            )}
            {kind === 'recurring' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="time">Kiekvieno seanso pradžios laikas</Label>
                  <Input
                    id="time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Savaitės dienos</Label>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={days.includes(value) ? 'default' : 'outline'}
                        onClick={() => toggleDay(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {(kind === 'just_in_time' || kind === 'on_demand') && (
              <p className="text-muted-foreground text-sm">
                {kind === 'just_in_time'
                  ? 'Kiekvienam užsiregistravusiam dalyviui seansas prasidės iškart.'
                  : 'Dalyvis galės pradėti evergreen video bet kuriuo metu.'}
              </p>
            )}
            <Button type="submit" isLoading={isSaving}>
              {t('addSchedule')}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Aktyvūs grafikai</CardTitle>
          <div className="mt-4 space-y-3">
            {schedules.length === 0 ? (
              <CardDescription>{t('scheduleOnDemand')}</CardDescription>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="border-border flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {schedule.schedule_type === 'recurring' ? (
                        <Repeat className="h-4 w-4" />
                      ) : (
                        <CalendarClock className="h-4 w-4" />
                      )}
                      {t(
                        `schedule${schedule.schedule_type
                          .split('_')
                          .map((part) => part[0]?.toUpperCase() + part.slice(1))
                          .join('')}` as never,
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {schedule.starts_at
                        ? new Date(schedule.starts_at).toLocaleString()
                        : formatRule(schedule.recurrence_rule) ||
                          t('scheduleOnDemand')}
                    </p>
                    {schedule.schedule_type === 'recurring' && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatRule(schedule.recurrence_rule)} ·{' '}
                        {schedule.timezone}
                      </p>
                    )}
                  </div>
                  {!supportView && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('removeSchedule')}
                      onClick={() => handleDelete(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>Konkretūs seansai</CardTitle>
          <CardDescription className="mt-1">
            Registracijos, talpa ir priminimai skaičiuojami pagal šiuos seansus.
          </CardDescription>
          <div className="mt-4 space-y-3">
            {visibleSessions.length === 0 ? (
              <CardDescription>
                Seansai atsiras išsaugojus fiksuotą grafiką arba gavus evergreen
                registraciją.
              </CardDescription>
            ) : (
              visibleSessions.map((session) => (
                <div
                  key={session.id}
                  className="border-border rounded-md border p-3"
                >
                  <p className="text-sm font-medium">
                    {new Date(session.starts_at!).toLocaleString()}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {session.status}
                    {session.ends_at
                      ? ` · iki ${new Date(session.ends_at).toLocaleString()}`
                      : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
