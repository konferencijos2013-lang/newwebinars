import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Card } from '@/components/ui/Card'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { createWebinar } from '@/features/webinars/api/webinars'
import { slugify } from '@/shared/utils/slug'

export function WebinarCreatePage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const account = useAccount()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState<'live' | 'automated'>('live')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [accessMode, setAccessMode] = useState<
    'public' | 'password_protected' | 'paid_access' | 'invited_only'
  >('public')
  const [roomPassword, setRoomPassword] = useState('')
  const [priceCents, setPriceCents] = useState('')
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [earlyEntry, setEarlyEntry] = useState('15')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (account.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-primary h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (account.status !== 'ready') {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-muted-foreground">{t('errorLoading')}</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    if (account.status !== 'ready') return

    try {
      const generatedSlug = slugify(slug || title)

      await createWebinar({
        account_id: account.account.id,
        title: title.trim(),
        slug: generatedSlug,
        type,
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

      navigate('/webinars')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(
        message.includes('PLAN_WEBINAR_LIMIT_EXCEEDED')
          ? t('planWebinarLimitExceeded')
          : message || t('errorSaving'),
      )
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('createTitle')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('createSubtitle')}</p>
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
              placeholder={t('webinarTitlePlaceholder')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">{t('slug')}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder={t('slugPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">{t('webinarType')}</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'live' | 'automated')
                }
              >
                <option value="live">{t('live')}</option>
                <option value="automated">{t('automated')}</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('webinarDescription')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('webinarDescriptionPlaceholder')}
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {type === 'live' && (
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">{t('scheduledAt')}</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}
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

          <div className="grid gap-4 sm:grid-cols-2">
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

            {accessMode === 'password_protected' && (
              <div className="space-y-2">
                <Label htmlFor="roomPassword">{t('roomPassword')}</Label>
                <Input
                  id="roomPassword"
                  type="password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                />
              </div>
            )}

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
          </div>

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
              onClick={() => navigate('/webinars')}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
