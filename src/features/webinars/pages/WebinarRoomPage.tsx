import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Send, Trash2 } from 'lucide-react'
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
  const scriptsRef = useRef<WebinarChatScript[]>([])
  const itemsRef = useRef<ChatDisplayItem[]>([])
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
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

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
      fetchWebinarBySlug(webinar.slug).then((updated) => {
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
      }).catch(() => {})
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

  useEffect(() => {
    const newScripts = scriptsRef.current
      .filter((s) => s.trigger_seconds <= elapsed)
      .filter(
        (s) =>
          !itemsRef.current.some((i) => i.kind === 'script' && i.id === s.id),
      )
    if (newScripts.length === 0) return
    const added = newScripts.map((s) => ({ ...s, kind: 'script' as const }))
    itemsRef.current = [...itemsRef.current, ...added]
    setItems(itemsRef.current)
  }, [elapsed])

  // Matches http(s)://, www., and bare domains like example.com/path.
  const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setChatError(null)
    if (!webinar || !newMessage.trim() || !(registration || isHostPreview)) return
    const text = newMessage.trim()
    if (!isAdmin && URL_REGEX.test(text)) {
      setChatError(t('linksNotAllowed'))
      return
    }
    const sent = await sendChatMessage({
      webinar_id: webinar.id,
      registration_id: registration?.id ?? null,
      sender_name: registration?.full_name ?? (isHostPreview ? t('host') : t('anonymous')),
      message: text,
    })
    itemsRef.current = [
      ...itemsRef.current,
      { ...sent, kind: 'message' as const },
    ]
    setItems(itemsRef.current)
    setNewMessage('')
  }

  async function handleDeleteMessage(messageId: string) {
    try {
      await deleteChatMessage(messageId)
      itemsRef.current = itemsRef.current.filter(
        (item) => !(item.kind === 'message' && item.id === messageId),
      )
      setItems(itemsRef.current)
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
            muted
            playsInline
            className="h-full w-full"
          />
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
                    className="absolute -right-8 top-1/2 -translate-y-1/2 rounded p-1 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                    title={t('deleteMessage')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {(registration || isHostPreview) && (
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
