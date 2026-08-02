import { useCallback, useEffect, useState } from 'react'
import { Bell, Mail, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import {
  fetchIntegrationConnections,
  type IntegrationConnection,
} from '@/features/settings/api/integrations'
import {
  createReminderRule,
  deleteReminderRule,
  fetchReminderRules,
  updateReminderRule,
  type ReminderRule,
} from '@/features/webinars/api/reminders'

const DEFAULT_SUBJECT = 'Primename: {{webinar_title}} prasidės netrukus'
const DEFAULT_BODY =
  'Sveiki, {{name}},\n\nprimename, kad webinaras „{{webinar_title}}“ prasidės netrukus.\n\nIki pasimatymo!'

function formatOffset(minutes: number) {
  if (minutes === 0) return 'Webinaro pradžios metu'
  if (minutes % 1440 === 0) return `${minutes / 1440} d. prieš`
  if (minutes % 60 === 0) return `${minutes / 60} val. prieš`
  return `${minutes} min. prieš`
}

export function ReminderRulesCard({
  webinarId,
  accountId,
  scheduledAt,
}: {
  webinarId: string
  accountId: string
  scheduledAt: string | null
}) {
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [minutesBefore, setMinutesBefore] = useState('60')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)

  const emailConnections = connections.filter(
    (connection) =>
      ['brevo', 'resend', 'smtp'].includes(connection.provider) &&
      connection.status === 'active',
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedRules, loadedConnections] = await Promise.all([
        fetchReminderRules(webinarId),
        fetchIntegrationConnections(accountId),
      ])
      setRules(loadedRules)
      setConnections(loadedConnections)
      setConnectionId(
        (current) =>
          current ||
          loadedConnections.find(
            (connection) =>
              ['brevo', 'resend', 'smtp'].includes(connection.provider) &&
              connection.status === 'active',
          )?.id ||
          '',
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [webinarId, accountId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function addRule() {
    const offset = Number(minutesBefore)
    if (!connectionId || !Number.isInteger(offset) || offset < 0) {
      setError(
        'Pasirinkite siuntimo integraciją ir įveskite laiką minutėmis (0 ar daugiau).',
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      const rule = await createReminderRule({
        webinarId,
        integrationConnectionId: connectionId,
        minutesBefore: offset,
        subject,
        body,
      })
      setRules((current) =>
        [...current, rule].sort((a, b) => b.minutes_before - a.minutes_before),
      )
      setAdding(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  async function toggleRule(rule: ReminderRule) {
    setError(null)
    try {
      const changed = await updateReminderRule(rule.id, {
        is_enabled: !rule.is_enabled,
      })
      setRules((current) =>
        current.map((item) => (item.id === changed.id ? changed : item)),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function removeRule(rule: ReminderRule) {
    if (
      !window.confirm(
        `Pašalinti priminimą „${formatOffset(rule.minutes_before)}“?`,
      )
    )
      return
    setError(null)
    try {
      await deleteReminderRule(rule.id)
      setRules((current) => current.filter((item) => item.id !== rule.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <Bell className="text-primary mt-0.5 h-5 w-5" />
          <div>
            <CardTitle>Priminimai</CardTitle>
            <CardDescription className="mt-1">
              El. pašto priminimai registruotiems dalyviams. Galite naudoti{' '}
              {'{{name}}'}, {'{{email}}'} ir {'{{webinar_title}}'}, kurie bus
              pakeisti siunčiant.
            </CardDescription>
          </div>
        </div>
        {!adding && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Pridėti priminimą
          </Button>
        )}
      </div>

      {!scheduledAt && (
        <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Pirmiausia nustatykite webinaro pradžios datą ir išsaugokite
          pakeitimus. Tuomet sistema galės apskaičiuoti priminimų siuntimo
          laiką.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {adding && (
        <div className="mt-5 space-y-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-connection">Siuntimo integracija</Label>
              <Select
                id="reminder-connection"
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                <option value="">Pasirinkite integraciją</option>
                {emailConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name} ({connection.provider})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-minutes">Minučių iki webinaro</Label>
              <Input
                id="reminder-minutes"
                type="number"
                min="0"
                value={minutesBefore}
                onChange={(event) => setMinutesBefore(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {Number.isFinite(Number(minutesBefore))
                  ? formatOffset(Number(minutesBefore))
                  : 'Įveskite minutes'}
              </p>
            </div>
          </div>
          {emailConnections.length === 0 && (
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Nėra aktyvios Brevo, Resend ar SMTP integracijos. Pirmiausia ją
              prijunkite puslapyje „Integracijos“.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="reminder-subject">Laiško tema</Label>
            <Input
              id="reminder-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-body">Laiško tekstas</Label>
            <Textarea
              id="reminder-body"
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(false)}
            >
              Atšaukti
            </Button>
            <Button
              type="button"
              isLoading={saving}
              disabled={!scheduledAt || emailConnections.length === 0}
              onClick={() => void addRule()}
            >
              <Mail className="h-4 w-4" />
              Išsaugoti priminimą
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground mt-5 text-sm">
          Kraunami priminimai…
        </p>
      ) : rules.length === 0 && !adding ? (
        <p className="text-muted-foreground mt-5 text-sm">
          Priminimų dar nėra. Dažniausiai nustatomi 24 val., 1 val. ir 10 min.
          iki webinaro.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">
                  {formatOffset(rule.minutes_before)}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {rule.subject || 'Be temos'} ·{' '}
                  {connections.find(
                    (connection) =>
                      connection.id === rule.integration_connection_id,
                  )?.display_name || 'Integracija nepasirinkta'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.is_enabled}
                    onChange={() => void toggleRule(rule)}
                  />
                  Įjungtas
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Pašalinti priminimą"
                  onClick={() => void removeRule(rule)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
