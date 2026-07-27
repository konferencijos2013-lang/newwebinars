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
      video.src = llhlsUrl
      video.addEventListener('loadedmetadata', tryPlay, { once: true })
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !videoRef.current) return
        if (!Hls.isSupported()) return
        hls = new Hls({ lowLatencyMode: true })
        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay)
        hls.loadSource(llhlsUrl)
        hls.attachMedia(videoRef.current)
      })
    }

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', tryPlay)
      hls?.destroy()
    }
  }, [videoRef, url])
}
