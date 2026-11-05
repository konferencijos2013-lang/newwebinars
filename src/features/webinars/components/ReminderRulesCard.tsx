import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Mail, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { updateWebinar } from '@/features/webinars/api/webinars'
import {
  normalizeMessageLanguage,
  standardReminders,
  translatedStandardReminder,
  type MessageLanguage,
} from '@/features/webinars/reminderTemplates'

const DEFAULT_SUBJECT = 'Ko „{{webinar_title}}“ anonsas jums nepasako'
const DEFAULT_BODY =
  'Sveiki, {{name}},\n\npavadinimas pasako temą. Jis nutyli tą vietą, kurią verta išgirsti gyvai.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}'
const DEFAULT_TELEGRAM_BODY =
  '{{name}}, „{{webinar_title}}“ pavadinimas nutyli svarbiausią vietą. Pradžia: {{starts_at}}. {{webinar_link}}'
const DEFAULT_MANYCHAT_BODY =
  '{{name}}, „{{webinar_title}}“ pavadinimas nutyli svarbiausią vietą. Pradžia: {{starts_at}}. {{webinar_link}}'

const DEFAULT_AFTER_SUBJECT = 'Ačiū, kad dalyvavote: {{webinar_title}}'
const DEFAULT_AFTER_BODY =
  'Sveiki, {{name}},\n\nwebinaras „{{webinar_title}}“ jau baigėsi. Jei nespėjote pasiūlymo, jį rasite čia:\n{{webinar_link}}'

function sortRules(rules: ReminderRule[]) {
  const rank = (timing: ReminderRule['timing']) =>
    timing === 'on_registration'
      ? 0
      : timing === 'before_start'
        ? 1
        : timing === 'after_start'
          ? 2
          : 3
  return [...rules].sort((a, b) => {
    const byTiming = rank(a.timing) - rank(b.timing)
    if (byTiming !== 0) return byTiming
    return a.timing === 'before_start'
      ? b.minutes_before - a.minutes_before
      : a.minutes_before - b.minutes_before
  })
}

export function ReminderRulesCard({
  webinarId,
  accountId,
  scheduledAt,
  durationMinutes,
  followBroadcast = false,
  messageLanguage = 'lt',
}: {
  webinarId: string
  accountId: string
  scheduledAt: string | null
  durationMinutes?: string | null
  followBroadcast?: boolean
  messageLanguage?: MessageLanguage
}) {
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [messageLanguageValue, setMessageLanguageValue] =
    useState<MessageLanguage>(normalizeMessageLanguage(messageLanguage))
  const [savingLanguage, setSavingLanguage] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [channel, setChannel] = useState<'email' | 'manychat' | 'telegram'>(
    'email',
  )
  const [minutesBefore, setMinutesBefore] = useState('60')
  const [timing, setTiming] = useState<ReminderRule['timing']>('before_start')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const { t } = useTranslation('webinars')

  function formatOffset(minutes: number, timing: ReminderRule['timing'] = 'before_start') {
    if (timing === 'on_registration') return t('reminders.onRegistration')
    if (timing === 'after_start') {
      return minutes === 0
        ? t('reminders.afterStartNow')
        : t('reminders.afterStart', { count: minutes })
    }
    if (minutes === 0) {
      return timing === 'after_end' ? t('reminders.afterEndNow') : t('reminders.atStart')
    }
    const count = minutes % 1440 === 0 ? minutes / 1440 : minutes % 60 === 0 ? minutes / 60 : minutes
    const unit =
      minutes % 1440 === 0
        ? t('reminders.days')
        : minutes % 60 === 0
          ? t('reminders.hours')
          : t('reminders.minutes')
    return timing === 'after_end'
      ? t('reminders.afterEnd', { count, unit })
      : t('reminders.before', { count, unit })
  }

  function audienceLabel(audience: ReminderRule['audience'] | undefined) {
    if (audience === 'attended') return t('reminders.audienceAttended')
    if (audience === 'missed') return t('reminders.audienceMissed')
    return t('reminders.audienceAll')
  }

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
      setError(t('reminders.errorOffset'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const rule = await createReminderRule({
        webinarId,
        integrationConnectionId: connectionId,
        minutesBefore: offset,
        timing,
        subject,
        body,
        channel,
      })
      setRules((current) => sortRules([...current, rule]))
      setAdding(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  async function changeMessageLanguage(next: MessageLanguage) {
    if (next === messageLanguageValue) return
    setSavingLanguage(true)
    setError(null)
    try {
      await updateWebinar(webinarId, { language: next })
      const changed: ReminderRule[] = []
      for (const rule of rules) {
        const translation = translatedStandardReminder(next, rule)
        if (
          !translation ||
          (translation.subject === (rule.subject ?? '') &&
            translation.body === (rule.body ?? ''))
        ) {
          continue
        }
        changed.push(
          await updateReminderRule(rule.id, {
            subject: translation.subject,
            body: translation.body,
          }),
        )
      }
      if (changed.length > 0) {
        setRules((current) =>
          current.map(
            (rule) => changed.find((item) => item.id === rule.id) ?? rule,
          ),
        )
      }
      setMessageLanguageValue(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingLanguage(false)
    }
  }

  async function generateStandard() {
    const targets = [
      emailConnections[0]
        ? { channel: 'email' as const, connectionId: emailConnections[0].id }
        : null,
      telegramConnections[0]
        ? {
            channel: 'telegram' as const,
            connectionId: telegramConnections[0].id,
          }
        : null,
    ].filter((item) => item !== null)
    if (targets.length === 0) {
      setError(t('reminders.errorConnect'))
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const created: ReminderRule[] = []
      for (const target of targets) {
        for (const reminder of standardReminders(messageLanguageValue)) {
          const exists = rules.some(
            (rule) =>
              rule.channel === target.channel &&
              rule.timing === reminder.timing &&
              rule.minutes_before === reminder.minutes &&
              (rule.audience ?? 'all') === reminder.audience,
          )
          if (exists) continue
          created.push(
            await createReminderRule({
              webinarId,
              integrationConnectionId: target.connectionId,
              channel: target.channel,
              minutesBefore: reminder.minutes,
              timing: reminder.timing,
              audience: reminder.audience,
              subject: reminder.subject,
              body:
                target.channel === 'email' ? reminder.body : reminder.shortBody,
            }),
          )
        }
      }
      if (created.length === 0) {
        setError(t('reminders.alreadyCreated'))
      }
      setRules((current) => sortRules([...current, ...created]))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setGenerating(false)
    }
  }

  function startEdit(rule: ReminderRule) {
    setAdding(false)
    setEditingId(rule.id)
    setEditSubject(rule.subject ?? '')
    setEditBody(rule.body ?? '')
    setError(null)
  }

  async function saveEdit(rule: ReminderRule) {
    setSavingEdit(true)
    setError(null)
    try {
      const changed = await updateReminderRule(rule.id, {
        subject: editSubject.trim() || null,
        body: editBody.trim() || null,
      })
      setRules((current) =>
        current.map((item) => (item.id === changed.id ? changed : item)),
      )
      setEditingId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingEdit(false)
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
        t('reminders.removeConfirm', {
        label: formatOffset(rule.minutes_before, rule.timing ?? 'before_start'),
      }),
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
            <CardTitle>{t('reminders.title')}</CardTitle>
            <CardDescription className="mt-1">
              {t('reminders.intro')}{' '}
              {followBroadcast
                ? t('reminders.clockBroadcast')
                : t('reminders.clockDuration')}{' '}
              {t('reminders.languageNote')} {t('reminders.placeholders')}{' '}
              {'{{name}}'}, {'{{email}}'}, {'{{webinar_title}}'},{' '}
              {'{{webinar_link}}'}, {'{{public_webinar_link}}'},               {'{{offer_link}}'}, {'{{starts_at}}'}, {'{{highlights}}'}{' '}
              {t('reminders.and')} {'{{next_session}}'}. {t('reminders.highlightsNote')}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="min-w-40 space-y-2">
            <Label htmlFor="reminder-language">{t('reminders.languageLabel')}</Label>
            <Select
              id="reminder-language"
              value={messageLanguageValue}
              disabled={savingLanguage}
              onChange={(event) =>
                void changeMessageLanguage(
                  normalizeMessageLanguage(event.target.value),
                )
              }
            >
              <option value="lt">Lietuvių</option>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </Select>
          </div>
          {!adding && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              isLoading={generating}
              onClick={() => void generateStandard()}
            >
              {t('reminders.createStandard')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {t('reminders.add')}
            </Button>
          </div>
          )}
        </div>
      </div>

      {!scheduledAt && (
        <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          {t('reminders.needSchedule')}
        </p>
      )}
      {!followBroadcast && !durationMinutes && (
        <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          {t('reminders.needDuration')}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {adding && (
        <div className="mt-5 space-y-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="reminder-channel">{t('reminders.channel')}</Label>
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
                <option value="email">{t('reminders.email')}</option>
                <option value="telegram">{t('reminders.telegram')}</option>
                <option value="manychat">{t('reminders.manychat')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-connection">{t('reminders.connection')}</Label>
              <Select
                id="reminder-connection"
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                <option value="">{t('reminders.chooseConnection')}</option>
                {availableConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.display_name} ({connection.provider})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-timing">{t('reminders.when')}</Label>
              <Select
                id="reminder-timing"
                value={timing}
                onChange={(event) => {
                  const next = event.target.value as ReminderRule['timing']
                  setTiming(next)
                  if (next === 'on_registration') setMinutesBefore('0')
                  if (next === 'after_end' && channel === 'email') {
                    setSubject(DEFAULT_AFTER_SUBJECT)
                    setBody(DEFAULT_AFTER_BODY)
                  } else if (next === 'before_start' && channel === 'email') {
                    setSubject(DEFAULT_SUBJECT)
                    setBody(DEFAULT_BODY)
                  }
                }}
              >
                <option value="on_registration">{t('reminders.timingOnRegistration')}</option>
                <option value="before_start">{t('reminders.timingBefore')}</option>
                <option value="after_start">{t('reminders.timingAfterStart')}</option>
                <option value="after_end">{t('reminders.timingAfterEnd')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-minutes">
                {timing === 'on_registration'
                  ? t('reminders.onRegistration')
                  : timing === 'after_end'
                  ? t('reminders.minutesAfterEnd')
                  : timing === 'after_start'
                    ? t('reminders.minutesAfterStart')
                    : t('reminders.minutesBefore')}
              </Label>
              <Input
                id="reminder-minutes"
                type="number"
                min="0"
                value={minutesBefore}
                onChange={(event) => setMinutesBefore(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {Number.isFinite(Number(minutesBefore))
                  ? formatOffset(Number(minutesBefore), timing)
                  : t('reminders.enterMinutes')}
              </p>
            </div>
          </div>
          {availableConnections.length === 0 && (
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              {channel === 'email'
                ? t('reminders.noEmail')
                : channel === 'telegram'
                  ? t('reminders.noTelegram')
                  : t('reminders.noManychat')}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="reminder-subject">
              {channel === 'email'
                ? t('reminders.subject')
                : t('reminders.internalTitle')}
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
                ? t('reminders.bodyEmail')
                : channel === 'telegram'
                  ? t('reminders.bodyTelegram')
                  : t('reminders.bodyManychat')}
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
              {t('reminders.cancel')}
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
              {t('reminders.saveReminder')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground mt-5 text-sm">
          {t('reminders.loading')}
        </p>
      ) : rules.length === 0 && !adding ? (
        <p className="text-muted-foreground mt-5 text-sm">
          {t('reminders.empty')}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {formatOffset(
                      rule.minutes_before,
                      rule.timing ?? 'before_start',
                    )}
                    {' · '}
                    {audienceLabel(rule.audience)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {rule.subject || t('reminders.noSubject')} ·{' '}
                    {connections.find(
                      (connection) =>
                        connection.id === rule.integration_connection_id,
                    )?.display_name || t('reminders.chooseConnection')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.is_enabled}
                      onChange={() => void toggleRule(rule)}
                    />
                    {t('reminders.enabled')}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('reminders.edit')}
                    onClick={() => startEdit(rule)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('reminders.remove')}
                    onClick={() => void removeRule(rule)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
              {editingId === rule.id && (
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-subject-${rule.id}`}>{t('reminders.editSubject')}</Label>
                    <Input
                      id={`edit-subject-${rule.id}`}
                      value={editSubject}
                      onChange={(event) => setEditSubject(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-body-${rule.id}`}>{t('reminders.editBody')}</Label>
                    <Textarea
                      id={`edit-body-${rule.id}`}
                      rows={6}
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      isLoading={savingEdit}
                      onClick={() => void saveEdit(rule)}
                    >
                      {t('reminders.saveText')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      {t('reminders.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
