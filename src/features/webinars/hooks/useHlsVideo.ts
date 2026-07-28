import { useEffect, type RefObject } from 'react'

// Cloudflare's HLS manifests need hls.js in Chrome/Firefox (only Safari can
// play .m3u8 natively via <video src>). Also explicitly call .play() once
// the media is ready — setting `src`/attaching hls.js asynchronously after
// mount doesn't reliably re-trigger the `autoPlay` attribute in every
// browser, so playback can silently stay paused at 0:00 with no picture.
export function useHlsVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  url: string | null | undefined,
) {
  useEffect(() => {
    const video = videoRef.current
    if (!url || !video) return
    let cancelled = false
    let hls: import('hls.js').default | null = null

    function tryPlay() {
      if (!cancelled) video?.play().catch(() => {})
    }

    // Live inputs are created with preferLowLatency: true; requesting this
    // variant of the manifest is what actually opts playback into
    // Cloudflare's Low-Latency HLS pipeline (glass-to-glass ~3-5s instead of
    // the standard ~20-30s segment+buffer delay).
    const llhlsUrl = `${url}${url.includes('?') ? '&' : '?'}protocol=llhls`

    if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
      // Safari's native HLS handles LL-HLS automatically when the manifest
      // has the llhls protocol parameter, so we can use the same URL. Native
      // playback also self-recovers from transient network errors, so no
      // extra retry logic is needed here.
      video.src = llhlsUrl
      video.addEventListener('loadedmetadata', tryPlay, { once: true })
      video.addEventListener('error', tryPlay)
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !videoRef.current) return
        if (!Hls.isSupported()) return
        // Cloudflare's recommended hls.js config for LL-HLS: keep the buffer
        // as small as possible so we play the newest partial segments as they
        // arrive, rather than accumulating a safety buffer that adds delay.
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 0,
          maxBufferLength: 2,
          maxMaxBufferLength: 4,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
        })
        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay)
        // The live input has just started (or the manifest briefly 404s
        // while Cloudflare spins up the first segments), so hls.js's first
        // load attempt commonly fails. Without recovery, a single fatal
        // error (network or media) permanently kills playback and the only
        // fix is a full page reload — which is exactly what we saw happen.
        // Retry network errors, and for fatal media errors try
        // recoverMediaError() once before giving up and reloading the source.
        let mediaErrorRecovered = false
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (!mediaErrorRecovered) {
                mediaErrorRecovered = true
                hls.recoverMediaError()
              } else {
                hls.destroy()
                hls = null
                if (!cancelled && videoRef.current) {
                  import('hls.js').then(({ default: Hls2 }) => {
                    if (cancelled || !videoRef.current || !Hls2.isSupported())
                      return
                    hls = new Hls2({
                      lowLatencyMode: true,
                      backBufferLength: 0,
                      maxBufferLength: 2,
                      maxMaxBufferLength: 4,
                      liveSyncDurationCount: 1,
                      liveMaxLatencyDurationCount: 3,
                    })
                    hls.on(Hls2.Events.MANIFEST_PARSED, tryPlay)
                    hls.loadSource(llhlsUrl)
                    hls.attachMedia(videoRef.current)
                  })
                }
              }
              break
            default:
              // Unrecoverable (e.g. manifest load error before any segments
              // arrived) — retry from scratch after a short delay instead of
              // giving up permanently.
              setTimeout(() => {
                if (!cancelled) hls?.loadSource(llhlsUrl)
              }, 2000)
              break
          }
        })
        hls.loadSource(llhlsUrl)
        hls.attachMedia(videoRef.current)
      })
    }

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', tryPlay)
      video.removeEventListener('error', tryPlay)
      hls?.destroy()
    }
  }, [videoRef, url])
}
