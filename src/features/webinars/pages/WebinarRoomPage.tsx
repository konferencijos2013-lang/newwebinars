import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Send, Trash2, VolumeX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import { useHlsVideo } from '@/features/webinars/hooks/useHlsVideo'
import { subscribeToStreamStatus } from '@/features/webinars/api/stream'
import {
  fetchWebinarBySlug,
  fetchRegistrationByToken,
  fetchChatMessages,
  sendChatMessage,
  fetchChatScripts,
  markJoinedWebinar,
  deleteChatMessage,
} from '@/features/webinars/api/public'
import type {
  ChatMessage,
  Registration,
  Webinar,
  WebinarChatScript,
} from '@/shared/database.types'

type ChatDisplayItem =
  (ChatMessage & { kind: 'message' }) | (WebinarChatScript & { kind: 'script' })

export function WebinarRoomPage() {
  const { t } = useTranslation('public')
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const isHostPreview = searchParams.get('preview') === '1'

  const [items, setItems] = useState<ChatDisplayItem[]>([])
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [newMessage, setNewMessage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const scriptsRef = useRef<WebinarChatScript[]>([])
  const itemsRef = useRef<ChatDisplayItem[]>([])
  const messageItemsRef = useRef<ChatDisplayItem[]>([])
  const elapsedRef = useRef(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hasAccessParams = Boolean(slug) && (Boolean(token) || isHostPreview)

  useEffect(() => {
    if (!hasAccessParams || !slug) return
    let isActive = true

    fetchWebinarBySlug(slug)
      .then(async (w) => {
        if (!isActive) return
        setWebinar(w)
        const [history, s] = await Promise.all([
          fetchChatMessages(w.id).catch(() => [] as ChatMessage[]),
          fetchChatScripts(w.id).catch(() => [] as WebinarChatScript[]),
        ])
        if (!isActive) return

        if (token) {
          const r = await fetchRegistrationByToken(token).catch(() => null)
          if (!isActive) return
          if (!r) {
            setStatus('error')
            return
          }
          setRegistration(r)
          await markJoinedWebinar(token)
        } else {
          const { data: session } = await supabase.auth.getSession()
          if (!isActive) return
          const userId = session.session?.user.id
          if (!userId) {
            setStatus('error')
            return
          }
          const { data: membership } = await supabase
            .from('account_members')
            .select('role')
            .eq('account_id', w.account_id)
            .eq('user_id', userId)
            .maybeSingle()
          if (!isActive) return
          if (!membership) {
            setStatus('error')
            return
          }
          setIsAdmin(true)
        }

        if (isHostPreview) {
          setIsAdmin(true)
        }

        scriptsRef.current = s
        const initialItems = history.map((m) => ({
          ...m,
          kind: 'message' as const,
        }))
        messageItemsRef.current = initialItems
        itemsRef.current = initialItems
        setItems(initialItems)
        setStatus('ready')
      })
      .catch(() => {
        if (!isActive) return
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [slug, token, isHostPreview, hasAccessParams])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  useEffect(() => {
    if (!webinar?.id) return
    const channel = subscribeToStreamStatus(webinar.id, (next) => {
      setWebinar((prev) => (prev ? { ...prev, cf_stream_status: next } : prev))
    })
    return () => {
      void supabase.removeChannel?.(channel)
    }
  }, [webinar?.id])

  // Receive new and soft-deleted messages immediately, so a moderator action
  // does not remain visible until the attendee refreshes the room.
  useEffect(() => {
    if (!webinar?.id) return
    const channel = supabase
      .channel(`public-chat-${webinar.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `webinar_id=eq.${webinar.id}`,
        },
        () => {
          fetchChatMessages(webinar.id)
            .then((history) => {
              const nextMessages = history.map((message) => ({
                ...message,
                kind: 'message' as const,
              }))
              messageItemsRef.current = nextMessages
              const nextItems = [
                ...nextMessages,
                ...scriptsRef.current
                  .filter(
                    (script) => script.trigger_seconds <= elapsedRef.current,
                  )
                  .map((script) => ({ ...script, kind: 'script' as const })),
              ]
              itemsRef.current = nextItems
              setItems(nextItems)
            })
            .catch(() => {})
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [webinar?.id])

  // Cloudflare only pushes live_input.connected/disconnected through a
  // separate Notifications policy, so poll the webinar row directly for the
  // latest status + playback URLs. The get-live-input-status edge function
  // also self-heals the row, but reading straight from Postgres is one less
  // moving part and works even if the edge function is misconfigured.
  useEffect(() => {
    if (!webinar?.slug) return
    let isActive = true

    const poll = async () => {
      if (!isActive) return
      try {
        const updated = await fetchWebinarBySlug(webinar.slug)
        if (!isActive) return
        setWebinar((prev) =>
          prev
            ? {
                ...prev,
                cf_stream_status: updated.cf_stream_status,
                cf_playback_hls_url: updated.cf_playback_hls_url,
                cf_playback_dash_url: updated.cf_playback_dash_url,
              }
            : prev,
        )
      } catch {
        // Ignore transient errors; next poll will retry.
      }
    }

    poll()
    const intervalId = setInterval(poll, 3000)
    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [webinar?.slug])

  // Keep the full webinar row in sync periodically for non-streaming fields.
  useEffect(() => {
    if (!webinar?.slug) return
    let isActive = true

    const sync = () => {
      fetchWebinarBySlug(webinar.slug)
        .then((updated) => {
          if (!isActive) return
          setWebinar((prev) =>
            prev
              ? {
                  ...prev,
                  status: updated.status,
                  scheduled_at: updated.scheduled_at,
                }
              : prev,
          )
        })
        .catch(() => {})
    }

    const intervalId = setInterval(sync, 15000)
    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [webinar?.slug])

  // Start playback as soon as we have a URL. hls.js will retry while the
  // manifest is still 404ing before the encoder connects, so there's no
  // need to gate on cf_stream_status being 'live' first.
  const isStreamViewable = Boolean(webinar?.cf_playback_hls_url)
  useHlsVideo(videoRef, isStreamViewable ? webinar?.cf_playback_hls_url : null)

  // Script messages are derived from the real playback position. This keeps an
  // evergreen chat in sync after pauses and seeking, instead of advancing with
  // wall-clock time while the video is stopped.
  useEffect(() => {
    const scriptedItems = scriptsRef.current
      .filter((script) => script.trigger_seconds <= elapsed)
      .map((script) => ({ ...script, kind: 'script' as const }))
    const nextItems = [...messageItemsRef.current, ...scriptedItems]
    if (
      nextItems.length === itemsRef.current.length &&
      nextItems.every((item, index) => item.id === itemsRef.current[index]?.id)
    ) {
      return
    }
    itemsRef.current = nextItems
    setItems(nextItems)
  }, [elapsed])

  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])

  function syncPlaybackTime() {
    const currentTime = videoRef.current?.currentTime
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      setElapsed(Math.max(0, Math.floor(currentTime)))
    }
  }

  // Matches http(s)://, www., and bare domains like example.com/path.
  const URL_REGEX =
    /(?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setChatError(null)
    if (!webinar || !newMessage.trim() || !registration) return
    const text = newMessage.trim()
    if (!isAdmin && URL_REGEX.test(text)) {
      setChatError(t('linksNotAllowed'))
      return
    }
    let sent: ChatMessage
    try {
      sent = await sendChatMessage({
        webinar_id: webinar.id,
        access_token: registration.access_token,
        message: text,
      })
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t('chatUnavailable'))
      return
    }
    messageItemsRef.current = [
      ...messageItemsRef.current,
      { ...sent, kind: 'message' as const },
    ]
    const nextItems = [
      ...messageItemsRef.current,
      ...scriptsRef.current
        .filter((script) => script.trigger_seconds <= elapsed)
        .map((script) => ({ ...script, kind: 'script' as const })),
    ]
    itemsRef.current = nextItems
    setItems(nextItems)
    setNewMessage('')
  }

  async function handleDeleteMessage(messageId: string) {
    try {
      await deleteChatMessage(messageId)
      messageItemsRef.current = messageItemsRef.current.filter(
        (item) => !(item.kind === 'message' && item.id === messageId),
      )
      const nextItems = itemsRef.current.filter(
        (item) => !(item.kind === 'message' && item.id === messageId),
      )
      itemsRef.current = nextItems
      setItems(nextItems)
    } catch {
      // Ignore transient errors; message may already be gone.
    }
  }

  if (!hasAccessParams) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold">{t('errorNotFound')}</h1>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !webinar || (!registration && !isHostPreview)) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold">{t('errorNotFound')}</h1>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">{webinar.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t('roomElapsed')}:{' '}
          {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
          {String(elapsed % 60).padStart(2, '0')}
        </p>
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_320px]">
        <div className="bg-muted relative flex aspect-video items-center justify-center overflow-hidden rounded-lg">
          {/* key forces a remount when the HLS URL appears so useHlsVideo
              re-initialises hls.js with a real source instead of staying
              stuck on the initial null. */}
          <video
            key={webinar?.cf_playback_hls_url ?? 'no-stream'}
            ref={videoRef}
            controls
            autoPlay
            muted={isMuted}
            playsInline
            className="h-full w-full"
            onLoadedMetadata={syncPlaybackTime}
            onTimeUpdate={syncPlaybackTime}
            onSeeked={syncPlaybackTime}
          />
          {isStreamViewable && isMuted && (
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                video.muted = false
                video.volume = 1
                video.play().catch(() => {})
                setIsMuted(false)
              }}
              className="bg-primary text-primary-foreground absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-lg transition-transform hover:scale-105"
            >
              <VolumeX className="h-4 w-4" />
              {t('unmute')}
            </button>
          )}
          {!isStreamViewable && (
            <div className="bg-muted absolute inset-0 flex items-center justify-center text-center">
              <div>
                <p className="text-muted-foreground text-lg font-medium">
                  {t('videoPlaceholder')}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('streamOffline')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-border flex flex-col rounded-lg border">
          {webinar && (
            <AiAssistant
              scope="webinar"
              scopeId={webinar.id}
              contextPrompt={`Help me manage the webinar "${webinar.title}".`}
            />
          )}
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {items.map((m, idx) => (
              <div
                key={idx}
                className={`group relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.kind === 'message'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-muted'
                }`}
              >
                <p className="text-xs font-semibold opacity-70">
                  {m.kind === 'script'
                    ? m.sender_role === 'host'
                      ? t('host')
                      : t('attendee')
                    : m.sender_name}
                </p>
                <p>{m.message}</p>
                {isAdmin && m.kind === 'message' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(m.id)}
                    className="text-destructive hover:bg-destructive/10 absolute top-1/2 -right-8 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    title={t('deleteMessage')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {registration && (
            <form onSubmit={handleSend} className="border-t p-3">
              {chatError && (
                <p className="text-destructive mb-2 text-xs">{chatError}</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={t('chatPlaceholder')}
                />
                <Button type="submit">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
