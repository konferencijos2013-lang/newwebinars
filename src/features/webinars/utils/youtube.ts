const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * Accept the public URL formats that hosts copy from YouTube and return the
 * video ID. The viewer constructs the iframe URL itself, never trusting an
 * arbitrary URL as an iframe source.
 */
export function getYouTubeVideoId(
  value: string | null | undefined,
): string | null {
  if (!value) return null

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const [kind, candidate] = url.pathname.split('/').filter(Boolean)
      if (kind === 'live' || kind === 'embed' || kind === 'shorts')
        id = candidate ?? null
    }
  }

  return id && YOUTUBE_VIDEO_ID.test(id) ? id : null
}

export function getYouTubeEmbedUrl(
  value: string | null | undefined,
): string | null {
  const id = getYouTubeVideoId(value)
  return id
    ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
    : null
}
