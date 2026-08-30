export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const CURRENT_SUBSCRIPTION_STATUSES = [
  'incomplete',
  'active',
  'past_due',
  'paused',
  'trialing',
] as const

export const TERMINAL_SUBSCRIPTION_STATUSES = [
  'canceled',
  'incomplete_expired',
  'unpaid',
] as const

export function requireEnv(
  get: (name: string) => string | undefined,
  name: string,
): string {
  const value = get(name)?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function allowedOrigins(appUrl: string, extra = ''): Set<string> {
  const values = [appUrl, ...extra.split(',')]
    .map((v) => v.trim())
    .filter(Boolean)
  return new Set(values.map((v) => new URL(v).origin))
}

export function validateRedirect(
  value: unknown,
  origins: Set<string>,
  fallback: string,
): string {
  const candidate = typeof value === 'string' && value ? value : fallback
  const url = new URL(candidate)
  if (!origins.has(url.origin) || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Redirect URL is not allowed')
  }
  return url.toString()
}

export function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number'
    ? new Date(seconds * 1000).toISOString()
    : null
}

export function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null)
}

export function checkoutIdempotencyKey(
  accountId: string,
  planCode: string,
  attemptId: string,
): string {
  return `checkout:${accountId}:${planCode}:${attemptId}`
}
