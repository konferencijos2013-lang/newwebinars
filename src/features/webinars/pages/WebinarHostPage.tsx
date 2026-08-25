import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useHlsVideo } from '@/features/webinars/hooks/useHlsVideo'
import {
  ArrowLeft,
  Copy,
  Radio,
  Video,
  Circle,
  ExternalLink,
  AlertCircle,
  VolumeX,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import {
  fetchWebinar,
  publishWebinar,
  updateWebinar,
} from '@/features/webinars/api/webinars'
import {
  createLiveInput,
  endLiveInput,
  pollLiveInputStatus,
  subscribeToStreamStatus,
} from '@/features/webinars/api/stream'
import {
  fetchOffer,
  getLiveCtaState,
  setLiveCtaVisibility,
} from '@/features/webinars/api/offers'
import type {
  StreamProvider,
  Webinar,
  WebinarOffer,
} from '@/shared/database.types'
import {
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
} from '@/features/webinars/utils/youtube'

export function WebinarHostPage() {
  const { t } = useTranslation('webinars')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamKey, setStreamKey] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [offer, setOffer] = useState<WebinarOffer | null>(null)
  const [liveCtaVisible, setLiveCtaVisible] = useState(false)
  const [isUpdatingCta, setIsUpdatingCta] = useState(false)
  const [streamProvider, setStreamProvider] =
    useState<StreamProvider>('cloudflare')
  const [youtubeLiveUrl, setYoutubeLiveUrl] = useState('')
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!id) return
    let isActive = true

    // Reset state on the next microtask before loading the selected webinar.
    // This prevents stale data from a prior route from remaining on screen.
    void Promise.resolve()
      .then(() => {
        setStatus('loading')
        setError(null)
        setWebinar(null)
        setStreamUrl(null)
        setStreamKey(null)
        setPlaybackUrl(null)
        return fetchWebinar(id)
      })
      .then((w) => {
        if (!isActive) return
        setWebinar(w)
        void Promise.all([fetchOffer(w.id), getLiveCtaState(w.id)])
          .then(([nextOffer, state]) => {
            if (isActive) {
              setOffer(nextOffer)
              setLiveCtaVisible(Boolean(state?.is_visible))
            }
          })
          .catch(() => {})
        setPlaybackUrl(w.cf_playback_hls_url)
        setStreamProvider(w.stream_provider)
        setYoutubeLiveUrl(w.youtube_live_url ?? '')
        setError(null)
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

  useEffect(() => {
    if (!id || streamProvider !== 'cloudflare') return

    const channel = subscribeToStreamStatus(id, (next) => {
      setWebinar((prev) => (prev ? { ...prev, cf_stream_status: next } : prev))
    })

    return () => {
      void supabase.removeChannel?.(channel)
    }
  }, [id, streamProvider])

  // Cloudflare only pushes live_input.connected/disconnected through a
  // separate Notifications policy, so poll directly through
  // get-live-input-status. That function asks Cloudflare and writes the latest
  // status + playback URLs into the webinar row, so the preview appears as soon
  // as the encoder connects.
  useEffect(() => {
    if (!id || streamProvider !== 'cloudflare') return
    let isActive = true

    const poll = () => {
      pollLiveInputStatus(id)
        .then((status) => {
          if (!isActive || !status) return
          setWebinar((prev) =>
            prev
              ? {
                  ...prev,
                  cf_stream_status: status.cf_stream_status,
                  cf_playback_hls_url: status.cf_playback_hls_url,
                  cf_playback_dash_url: status.cf_playback_dash_url,
                }
              : prev,
          )
          setPlaybackUrl(status.cf_playback_hls_url)
        })
        .catch(() => {})
    }

    poll()
    // 3s is a good balance between responsiveness and rate-limit friendliness.
    const intervalId = setInterval(poll, 3000)

    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [id, streamProvider])

  // Also keep the full webinar row in sync periodically so other fields (e.g.
  // stream_key shown in the right panel) never go stale.
  useEffect(() => {
    if (!id) return
    let isActive = true

    const sync = () => {
      fetchWebinar(id)
        .then((updated) => {
          if (!isActive) return
          setWebinar(updated)
          if (updated.cf_playback_hls_url) {
            setPlaybackUrl(updated.cf_playback_hls_url)
          }
        })
        .catch(() => {})
    }

    const intervalId = setInterval(sync, 15000)
    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [id])

  const youtubeEmbedUrl = getYouTubeEmbedUrl(youtubeLiveUrl)
  const isYouTube = streamProvider === 'youtube'
  const isStreamViewable =
    !isYouTube &&
    Boolean(playbackUrl) &&
    (webinar?.cf_stream_status === 'live' ||
      webinar?.cf_stream_status === 'connected')
  useHlsVideo(videoRef, isStreamViewable ? playbackUrl : null)

  async function handleGoLive() {
    if (!id) return
    setIsCreating(true)
    setError(null)

    try {
      if (webinar && webinar.status !== 'published') {
        const updated = await publishWebinar(webinar.id)
        setWebinar(updated)
      }

      const result = await createLiveInput(id)
      setStreamUrl(result.rtmps_url)
      setStreamKey(result.stream_key)
      setPlaybackUrl(result.playback_hls_url)

      setWebinar((prev) =>
        prev
          ? {
              ...prev,
              cf_live_input_uid: result.live_input_uid,
              cf_stream_status: 'idle',
              cf_playback_hls_url: result.playback_hls_url,
            }
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  async function handleEndStream() {
    if (!id) return
    setIsEnding(true)
    setError(null)

    try {
      await endLiveInput(id)
      setStreamUrl(null)
      setStreamKey(null)
      setPlaybackUrl(null)
      setWebinar((prev) =>
        prev
          ? {
              ...prev,
              cf_live_input_uid: null,
              cf_stream_status: 'ended',
              cf_playback_hls_url: null,
              cf_playback_dash_url: null,
            }
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsEnding(false)
    }
  }

  async function saveStreamProvider() {
    if (!webinar) return
    const normalizedUrl = youtubeLiveUrl.trim()
    if (streamProvider === 'youtube' && !getYouTubeVideoId(normalizedUrl)) {
      setError(t('youtubeUrlInvalid'))
      return
    }

    setIsSavingProvider(true)
    setError(null)
    try {
      const updated = await updateWebinar(webinar.id, {
        stream_provider: streamProvider,
        youtube_live_url: streamProvider === 'youtube' ? normalizedUrl : null,
      })
      setWebinar(updated)
      setYoutubeLiveUrl(updated.youtube_live_url ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function toggleCta() {
    if (!webinar) return
    setIsUpdatingCta(true)
    setError(null)
    try {
      const next = await setLiveCtaVisibility(webinar.id, !liveCtaVisible)
      setLiveCtaVisible(next.is_visible)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsUpdatingCta(false)
    }
  }

  function copyToClipboard(value: string, field: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
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
      <div className="mx-auto max-w-3xl">
        <Card className="text-center">
          <CardTitle>{t('errorNotFound')}</CardTitle>
          <CardDescription className="mt-2">
            {error ?? t('errorNotFound')}
          </CardDescription>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/webinars')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
        </Card>
      </div>
    )
  }

  const isLive = !isYouTube && webinar.cf_stream_status === 'live'
  const hasInput = !isYouTube && Boolean(webinar.cf_live_input_uid)
  // Public registration page — attendees must sign up here to get an
  // access token, then use the waiting room / live room. The old link
  // pointed directly at /room?preview=1, which is only meant for the
  // logged-in host's own preview and fails for everyone else.
  const viewerUrl = `${window.location.origin}/w/${webinar.slug}`

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/webinars/${webinar.id}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {webinar.title}
            </h1>
            <p className="text-muted-foreground text-sm">{t('hostPage')}</p>
          </div>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            isLive
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
              : hasInput
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {isLive && <Circle className="h-2 w-2 animate-pulse fill-current" />}
          <Radio className="h-4 w-4" />
          {isYouTube
            ? t('streamStatusYoutube')
            : t(`streamStatus${webinar.cf_stream_status}`)}
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">
                <Video className="mr-2 inline h-5 w-5" />
                {t('streamPreview')}
              </CardTitle>
              <CardDescription className="mt-1">
                {isYouTube && !youtubeEmbedUrl
                  ? t('youtubePreviewMissingUrl')
                  : isStreamViewable
                    ? t('streamPreviewActive')
                    : t('streamPreviewIdle')}
              </CardDescription>
            </div>
          </div>

          <div className="bg-muted relative flex aspect-video items-center justify-center overflow-hidden rounded-lg">
            {isYouTube && youtubeEmbedUrl ? (
              <iframe
                title={t('youtubePreviewTitle')}
                src={youtubeEmbedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <video
                ref={videoRef}
                controls
                autoPlay
                muted={isMuted}
                playsInline
                className="h-full w-full"
              />
            )}
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
            {(!isYouTube || !youtubeEmbedUrl) && !isStreamViewable && (
              <div className="bg-muted absolute inset-0 flex items-center justify-center text-center">
                <div>
                  <Video className="text-muted-foreground mx-auto mb-2 h-12 w-12" />
                  <p className="text-muted-foreground text-sm">
                    {hasInput ? t('waitingForFeed') : t('videoPlaceholder')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {isYouTube ? (
              <>
                {webinar.status !== 'published' && (
                  <Button
                    onClick={() => {
                      setIsCreating(true)
                      setError(null)
                      publishWebinar(webinar.id)
                        .then(setWebinar)
                        .catch((err) =>
                          setError(
                            err instanceof Error ? err.message : String(err),
                          ),
                        )
                        .finally(() => setIsCreating(false))
                    }}
                    isLoading={isCreating}
                  >
                    <Radio className="mr-2 h-4 w-4" />
                    {t('publishForYoutube')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      'https://studio.youtube.com/',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('openYoutubeStudio')}
                </Button>
              </>
            ) : !hasInput ? (
              <Button onClick={handleGoLive} isLoading={isCreating}>
                <Radio className="mr-2 h-4 w-4" />
                {isCreating ? t('startingStream') : t('goLive')}
              </Button>
            ) : (
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={handleEndStream}
                isLoading={isEnding}
              >
                {isEnding ? t('endingStream') : t('endStream')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.open(viewerUrl, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('openViewerRoom')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `/webinars/${id}/moderation`,
                  'webinar-moderation',
                  'popup=yes,width=980,height=760',
                )
              }
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {t('openModeration')}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <CardTitle className="text-base">{t('streamProvider')}</CardTitle>
              <CardDescription className="mt-1">
                {t('streamProviderDescription')}
              </CardDescription>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stream-provider">{t('streamProvider')}</Label>
              <Select
                id="stream-provider"
                value={streamProvider}
                onChange={(event) =>
                  setStreamProvider(event.target.value as StreamProvider)
                }
              >
                <option value="cloudflare">
                  {t('streamProviderCloudflare')}
                </option>
                <option value="youtube">{t('streamProviderYoutube')}</option>
              </Select>
            </div>
            {isYouTube && (
              <div className="space-y-2">
                <Label htmlFor="youtube-live-url">{t('youtubeLiveUrl')}</Label>
                <Input
                  id="youtube-live-url"
                  type="url"
                  placeholder="https://www.youtube.com/live/..."
                  value={youtubeLiveUrl}
                  onChange={(event) => setYoutubeLiveUrl(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t('youtubeLiveUrlHelp')}
                </p>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => void saveStreamProvider()}
              isLoading={isSavingProvider}
            >
              {t('saveStreamProvider')}
            </Button>
          </Card>

          {hasInput && streamUrl && streamKey && (
            <Card className="space-y-4">
              <CardTitle className="text-base">{t('streamSettings')}</CardTitle>
              <div className="space-y-3">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    {t('rtmpUrl')}
                  </label>
                  <div className="flex gap-2">
                    <Input readOnly value={streamUrl} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(streamUrl, 'rtmpUrl')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    {t('streamKey')}
                  </label>
                  <div className="flex gap-2">
                    <Input readOnly type="password" value={streamKey} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(streamKey, 'streamKey')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {copiedField && (
                  <p className="text-muted-foreground text-xs">
                    {t('copied')} ({copiedField})
                  </p>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle className="text-base">Pardavimo mygtukas</CardTitle>
            <CardDescription className="mt-1">
              {offer?.target_url
                ? `Dalyviams: ${offer.button_text}`
                : 'Pirmiausia nustatykite mygtuką čato scenarijaus puslapyje.'}
            </CardDescription>
            <Button
              className="mt-4 w-full"
              variant={liveCtaVisible ? 'outline' : 'default'}
              disabled={!offer?.target_url}
              isLoading={isUpdatingCta}
              onClick={() => void toggleCta()}
            >
              {liveCtaVisible
                ? 'Išjungti pardavimo mygtuką'
                : 'Įjungti pardavimo mygtuką'}
            </Button>
          </Card>

          <Card>
            <CardTitle className="text-base">{t('viewerLink')}</CardTitle>
            <CardDescription className="mt-1">
              {t('viewerLinkDescription')}
            </CardDescription>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => copyToClipboard(viewerUrl, 'viewerUrl')}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('copyViewerLink')}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
