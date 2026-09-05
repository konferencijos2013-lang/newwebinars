export function safePublicUrl(value: unknown, fallback = '#') {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const candidate = value.trim()
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : fallback
  } catch {
    return fallback
  }
}
