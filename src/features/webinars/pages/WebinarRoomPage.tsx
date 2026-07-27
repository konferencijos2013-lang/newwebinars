import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import { subscribeToStreamStatus } from '@/features/webinars/api/stream'
import {
  fetchWebinarBySlug,
  fetchRegistrationByToken,
  fetchChatMessages,
  sendChatMessage,
  fetchChatScripts,
  markJoinedWebinar,
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
  const scriptsRef = useRef<WebinarChatScript[]>([])
  const itemsRef = useRef<ChatDisplayItem[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<{ destroy: () => void } | null>(null)

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

  useEffect(() => {
    if (!webinar?.cf_playback_hls_url || !videoRef.current) return
    let cancelled = false

    if (videoRef.current.canPlayType('application/vnd.apple.mpegurl') !== '') {
      videoRef.current.src = webinar.cf_playback_hls_url
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !videoRef.current || !Hls.isSupported()) return
        const hls = new Hls()
        hls.loadSource(webinar.cf_playback_hls_url!)
        hls.attachMedia(videoRef.current!)
        hlsRef.current = hls
      })
    }

    return () => {
      cancelled = true
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [webinar?.cf_playback_hls_url])

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!webinar || !newMessage.trim() || !(registration || isHostPreview)) return
    const sent = await sendChatMessage({
      webinar_id: webinar.id,
      registration_id: registration?.id ?? null,
      sender_name: registration?.full_name ?? (isHostPreview ? t('host') : t('anonymous')),
      message: newMessage.trim(),
    })
    itemsRef.current = [
      ...itemsRef.current,
      { ...sent, kind: 'message' as const },
    ]
    setItems(itemsRef.current)
    setNewMessage('')
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
          {(webinar.cf_stream_status === 'live' ||
            webinar.cf_stream_status === 'connected') &&
          webinar.cf_playback_hls_url ? (
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              playsInline
              className="h-full w-full"
            />
          ) : (
            <div className="text-center">
              <p className="text-muted-foreground text-lg font-medium">
                {t('videoPlaceholder')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('streamOffline')}
              </p>
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
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
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
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {(registration || isHostPreview) && (
            <form onSubmit={handleSend} className="border-t p-3">
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
