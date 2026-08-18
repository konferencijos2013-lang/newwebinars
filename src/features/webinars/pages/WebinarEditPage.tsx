import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { fetchWebinar, updateWebinar } from '@/features/webinars/api/webinars'
import { ReminderRulesCard } from '@/features/webinars/components/ReminderRulesCard'
import type { Webinar } from '@/shared/database.types'
import { slugify } from '@/shared/utils/slug'

export function WebinarEditPage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [accessMode, setAccessMode] = useState<
    'public' | 'password_protected' | 'paid_access' | 'invited_only'
  >('public')
  const [priceCents, setPriceCents] = useState('')
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [earlyEntry, setEarlyEntry] = useState('15')

  useEffect(() => {
    if (!id) return
    let isActive = true

    fetchWebinar(id)
      .then((w) => {
        if (!isActive) return
        setWebinar(w)
        setTitle(w.title)
        setSlug(w.slug)
        setDescription(w.description ?? '')
        setScheduledAt(
          w.scheduled_at
            ? new Date(w.scheduled_at).toISOString().slice(0, 16)
            : '',
        )
        setDurationMinutes(w.duration_minutes?.toString() ?? '')
        setMaxParticipants(w.max_participants?.toString() ?? '')
        setAccessMode(w.access_mode)
        setPriceCents(w.price_cents?.toString() ?? '')
        setWaitingRoom(w.waiting_room_enabled)
        setEarlyEntry(w.early_entry_minutes.toString())
        setStatus('ready')
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!webinar) return
    setIsSaving(true)
    setError(null)

    try {
      await updateWebinar(webinar.id, {
        title: title.trim(),
        slug: slugify(slug),
        description: description.trim() || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        max_participants: maxParticipants ? Number(maxParticipants) : null,
        access_mode: accessMode,
        price_cents:
          accessMode === 'paid_access' && priceCents
            ? Number(priceCents)
            : null,
        waiting_room_enabled: waitingRoom,
        early_entry_minutes: Number(earlyEntry) || 15,
      })
      navigate(`/webinars/${webinar.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !webinar) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="text-center">
          <h3 className="text-lg font-semibold">{t('errorNotFound')}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {error ?? t('errorNotFound')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/webinars')}
          >
            {t('cancel')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('editTitle')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('editSubtitle')}</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">{t('webinarTitle')}</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">{t('slug')}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessMode">{t('accessMode')}</Label>
              <Select
                id="accessMode"
                value={accessMode}
                onChange={(e) =>
                  setAccessMode(
                    e.target.value as
                      | 'public'
                      | 'password_protected'
                      | 'paid_access'
                      | 'invited_only',
                  )
                }
              >
                <option value="public">{t('accessPublic')}</option>
                <option value="password_protected">
                  {t('accessPassword')}
                </option>
                <option value="paid_access">{t('accessPaid')}</option>
                <option value="invited_only">{t('accessInvited')}</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('webinarDescription')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">{t('scheduledAt')}</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t('durationMinutes')}</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxParticipants">{t('maxParticipants')}</Label>
              <Input
                id="maxParticipants"
                type="number"
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="earlyEntry">{t('earlyEntryMinutes')}</Label>
              <Input
                id="earlyEntry"
                type="number"
                min={0}
                value={earlyEntry}
                onChange={(e) => setEarlyEntry(e.target.value)}
              />
            </div>
          </div>

          {accessMode === 'paid_access' && (
            <div className="space-y-2">
              <Label htmlFor="priceCents">{t('priceCents')}</Label>
              <Input
                id="priceCents"
                type="number"
                min={0}
                value={priceCents}
                onChange={(e) => setPriceCents(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="waitingRoom"
              type="checkbox"
              checked={waitingRoom}
              onChange={(e) => setWaitingRoom(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="waitingRoom">{t('waitingRoom')}</Label>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/webinars/${webinar.id}`)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Card>
      <ReminderRulesCard
        webinarId={webinar.id}
        accountId={webinar.account_id}
        scheduledAt={webinar.scheduled_at}
      />
    </div>
  )
}
