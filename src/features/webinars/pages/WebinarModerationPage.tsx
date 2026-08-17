import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Ban, Check, LogOut, MessageSquareOff, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { fetchWebinar } from '@/features/webinars/api/webinars'
import type { Webinar } from '@/shared/database.types'

type ModerationMessage = {
  id: string
  webinar_id: string
  registration_id: string | null
  sender_name: string
  message: string
  message_type: string
  sent_at: string
  deleted_at: string | null
  chat_blocked_at: string | null
  removed_from_webinar_at: string | null
}

export function WebinarModerationPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [messages, setMessages] = useState<ModerationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [
      { data: allowed, error: accessError },
      { data: rows, error: messagesError },
      webinarRow,
    ] = await Promise.all([
      supabase.rpc('can_moderate_webinar', { p_webinar_id: id }),
      supabase.rpc('get_webinar_moderation_messages', { p_webinar_id: id }),
      fetchWebinar(id),
    ])
    if (accessError || !allowed) throw new Error(t('moderationAccessDenied'))
    if (messagesError) throw messagesError
    setWebinar(webinarRow)
    setMessages((rows ?? []) as ModerationMessage[])
  }, [id, t])

  useEffect(() => {
    let active = true
    void Promise.resolve()
      .then(() => load())
      .catch(
        (err) =>
          active &&
          setError(err instanceof Error ? err.message : t('errorLoading')),
      )
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [load, t])

  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`moderation-chat-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `webinar_id=eq.${id}`,
        },
        () => void load().catch(() => {}),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registrations',
          filter: `webinar_id=eq.${id}`,
        },
        () => void load().catch(() => {}),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id, load])

  async function moderate(
    registrationId: string | null,
    action: 'mute' | 'unmute' | 'remove' | 'restore',
  ) {
    if (!registrationId) return
    setBusyId(`${registrationId}-${action}`)
    try {
      const { error } = await supabase.rpc('moderate_webinar_registration', {
        p_registration_id: registrationId,
        p_action: action,
      })
      if (error) throw error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('moderationFailed'))
    } finally {
      setBusyId(null)
    }
  }

  async function deleteMessage(messageId: string) {
    setBusyId(messageId)
    try {
      const { error } = await supabase.rpc('soft_delete_chat_message', {
        p_message_id: messageId,
      })
      if (error) throw error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('moderationFailed'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (error && !webinar)
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-destructive">{error}</p>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          {t('back')}
        </Button>
      </div>
    )

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-4 sm:p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            {t('moderationWindow')}
          </p>
          <h1 className="text-2xl font-bold">{webinar?.title}</h1>
        </div>
        <Button variant="outline" onClick={() => window.close()}>
          {t('closeModeration')}
        </Button>
      </header>
      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}
      <div className="space-y-3">
        {messages.map((message) => {
          const muted = Boolean(message.chat_blocked_at)
          const removed = Boolean(message.removed_from_webinar_at)
          return (
            <article
              key={message.id}
              className={`rounded-lg border p-4 ${message.deleted_at ? 'bg-muted/50 opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{message.sender_name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {message.deleted_at ? t('messageHidden') : message.message}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!message.deleted_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={busyId === message.id}
                      onClick={() => void deleteMessage(message.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t('deleteMessage')}
                    </Button>
                  )}
                  {message.registration_id && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={
                          busyId ===
                          `${message.registration_id}-${muted ? 'unmute' : 'mute'}`
                        }
                        onClick={() =>
                          void moderate(
                            message.registration_id,
                            muted ? 'unmute' : 'mute',
                          )
                        }
                      >
                        {muted ? (
                          <Check className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <MessageSquareOff className="mr-1 h-3.5 w-3.5" />
                        )}
                        {muted ? t('unmuteParticipant') : t('muteParticipant')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={
                          removed
                            ? undefined
                            : 'border-red-600 text-red-700 hover:bg-red-50'
                        }
                        isLoading={
                          busyId ===
                          `${message.registration_id}-${removed ? 'restore' : 'remove'}`
                        }
                        onClick={() =>
                          void moderate(
                            message.registration_id,
                            removed ? 'restore' : 'remove',
                          )
                        }
                      >
                        {removed ? (
                          <Check className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <LogOut className="mr-1 h-3.5 w-3.5" />
                        )}
                        {removed
                          ? t('restoreParticipant')
                          : t('removeParticipant')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
        {messages.length === 0 && (
          <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
            <Ban className="mx-auto mb-2 h-6 w-6" />
            {t('noChatMessages')}
          </div>
        )}
      </div>
    </main>
  )
}
