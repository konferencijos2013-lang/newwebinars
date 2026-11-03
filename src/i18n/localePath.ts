export const LOCALES = ['en', 'lt', 'ru'] as const

export type Locale = (typeof LOCALES)[number]

const PREFIXED = new Set<string>(['lt', 'ru'])

export function localeFromPath(pathname: string) {
  const [segment, ...rest] = pathname.split('/').filter(Boolean)
  if (segment && PREFIXED.has(segment)) {
    const remainder = rest.length ? `/${rest.join('/')}` : '/'
    return { locale: segment as Locale, basename: `/${segment}`, pathname: remainder }
  }
  return { locale: 'en' as const, basename: '/', pathname: pathname || '/' }
}

export function currentLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  return localeFromPath(window.location.pathname).locale
}

export function isReservedLocaleSlug(slug: string) {
  return PREFIXED.has(slug)
}

export function localizedPath(path: string, locale: Locale = currentLocale()) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  const url = new URL(path, 'https://newwebinars.local')
  const { pathname } = localeFromPath(url.pathname)
  const prefix = locale === 'en' ? '' : `/${locale}`
  const nextPath = pathname === '/' ? prefix || '/' : `${prefix}${pathname}`
  return `${nextPath}${url.search}${url.hash}`
}

export function localizedHref(path: string, locale: Locale = currentLocale()) {
  return `${window.location.origin}${localizedPath(path, locale)}`
}
