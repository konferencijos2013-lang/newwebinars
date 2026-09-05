import { useCallback, useEffect, useState } from 'react'
import { Bell, Mail, MessageCircle, Plus, Trash2 } from 'lucide-react'
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
  'Sveiki, {{name}},\n\nprimename, kad webinaras „{{webinar_title}}“ prasidės netrukus.\n\nPrisijungti prie webinaro:\n{{webinar_link}}\n\nIki pasimatymo!'
const DEFAULT_TELEGRAM_BODY =
  'Sveiki, {{name}}! Webinaras „{{webinar_title}}“ prasidės netrukus. Prisijungti: {{webinar_link}}'
const DEFAULT_MANYCHAT_BODY =
  'Sveiki, {{name}}! Webinaras „{{webinar_title}}“ prasidės netrukus. Prisijungti: {{webinar_link}}'

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
  const [channel, setChannel] = useState<'email' | 'manychat' | 'telegram'>(
    'email',
  )
  const [minutesBefore, setMinutesBefore] = useState('60')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)

  const manyChatConnections = connections.filter(
    (connection) =>
      connection.provider === 'manychat' && connection.status === 'active',
  )
  const telegramConnections = connections.filter(
    (connection) =>
      connection.provider === 'telegram' && connection.status === 'active',
  )
  const emailConnections = connections.filter(
    (connection) =>
      ['brevo', 'resend', 'smtp'].includes(connection.provider) &&
      connection.status === 'active',
  )
  const availableConnections =
    channel === 'email'
      ? emailConnections
      : channel === 'telegram'
        ? telegramConnections
        : manyChatConnections

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
        channel,
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
              El. pašto, Telegram arba ManyChat priminimai registruotiems
              dalyviams. Galite naudoti {'{{name}}'}, {'{{email}}'},{' '}
              {'{{webinar_title}}'},{' {{webinar_link}}'} ir{' '}
              {'{{public_webinar_link}}'}, kurie bus pakeisti siunčiant.{' '}
              {'{{webinar_link}}'} yra asmeninė prisijungimo nuoroda, o{' '}
              {'{{public_webinar_link}}'} – viešas registracijos puslapis.
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reminder-channel">Kanalas</Label>
              <Select
                id="reminder-channel"
                value={channel}
                onChange={(event) => {
                  const next = event.target.value as
                    'email' | 'manychat' | 'telegram'
                  setChannel(next)
                  setConnectionId(
                    next === 'email'
                      ? (emailConnections[0]?.id ?? '')
                      : next === 'telegram'
                        ? (telegramConnections[0]?.id ?? '')
                        : (manyChatConnections[0]?.id ?? ''),
                  )
                  if (next === 'manychat') {
                    setSubject('')
                    setBody(DEFAULT_MANYCHAT_BODY)
                  } else if (next === 'telegram') {
                    setSubject('')
                    setBody(DEFAULT_TELEGRAM_BODY)
                  } else {
                    setSubject(DEFAULT_SUBJECT)
                    setBody(DEFAULT_BODY)
                  }
                }}
              >
                <option value="email">El. paštas</option>
                <option value="telegram">Telegram</option>
                <option value="manychat">ManyChat</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-connection">Siuntimo integracija</Label>
              <Select
                id="reminder-connection"
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                <option value="">Pasirinkite integraciją</option>
                {availableConnections.map((connection) => (
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
          {availableConnections.length === 0 && (
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              {channel === 'email'
                ? 'Nėra aktyvios Brevo, Resend ar SMTP integracijos. Pirmiausia ją prijunkite puslapyje „Integracijos“.'
                : channel === 'telegram'
                  ? 'Nėra aktyvaus Telegram boto. Pirmiausia prijunkite BotFather tokeną puslapyje „Integracijos“.'
                  : 'Nėra aktyvios ManyChat integracijos. Pirmiausia įrašykite API raktą ir ManyChat susiejimo nuorodos šabloną puslapyje „Integracijos“. '}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="reminder-subject">
              {channel === 'email'
                ? 'Laiško tema'
                : 'Pranešimo pavadinimas (vidinis)'}
            </Label>
            <Input
              id="reminder-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-body">
              {channel === 'email'
                ? 'Laiško tekstas'
                : channel === 'telegram'
                  ? 'Telegram pranešimo tekstas'
                  : 'ManyChat pranešimo tekstas'}
            </Label>
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
              disabled={!scheduledAt || availableConnections.length === 0}
              onClick={() => void addRule()}
            >
              {channel === 'email' ? (
                <Mail className="h-4 w-4" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
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
