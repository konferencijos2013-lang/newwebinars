import type { Locale } from '@/i18n/localePath'
import { pageUrl, SITE_ORIGIN, type SeoLocale } from './marketingPages'

function ensureMeta(selector: string, create: () => HTMLElement) {
  return document.head.querySelector(selector) ?? document.head.appendChild(create())
}

function setContent(selector: string, attribute: string, value: string, create: () => HTMLElement) {
  const node = ensureMeta(selector, create)
  node.setAttribute(attribute, value)
}

export function applyPageMeta(page: {
  title: string
  description: string
  path: string
  locale: Locale
  index: boolean
  alternates?: Record<string, string>
}) {
  const locale = page.locale as SeoLocale
  const canonical = pageUrl(locale, page.path)
  document.title = page.title
  document.documentElement.lang = locale
  setContent(
    'meta[name="description"]',
    'content',
    page.description,
    () => {
      const meta = document.createElement('meta')
      meta.name = 'description'
      return meta
    },
  )
  setContent(
    'meta[name="robots"]',
    'content',
    page.index ? 'index,follow' : 'noindex,nofollow',
    () => {
      const meta = document.createElement('meta')
      meta.name = 'robots'
      return meta
    },
  )
  setContent(
    'link[rel="canonical"]',
    'href',
    canonical,
    () => {
      const link = document.createElement('link')
      link.rel = 'canonical'
      return link
    },
  )
  const og: [string, string][] = [
    ['og:title', page.title],
    ['og:description', page.description],
    ['og:url', canonical],
    ['og:locale', locale === 'lt' ? 'lt_LT' : locale === 'ru' ? 'ru_RU' : 'en_US'],
  ]
  for (const [property, content] of og) {
    setContent(
      `meta[property="${property}"]`,
      'content',
      content,
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', property)
        return meta
      },
    )
  }
  setContent(
    'meta[name="twitter:title"]',
    'content',
    page.title,
    () => {
      const meta = document.createElement('meta')
      meta.name = 'twitter:title'
      return meta
    },
  )
  setContent(
    'meta[name="twitter:description"]',
    'content',
    page.description,
    () => {
      const meta = document.createElement('meta')
      meta.name = 'twitter:description'
      return meta
    },
  )
  const alternates: [string, string][] = page.alternates
    ? Object.entries(page.alternates)
    : [
        ['en', pageUrl('en', page.path)],
        ['lt', pageUrl('lt', page.path)],
        ['ru', pageUrl('ru', page.path)],
        ['x-default', pageUrl('en', page.path)],
      ]
  for (const [lang, href] of alternates) {
    setContent(
      `link[rel="alternate"][hreflang="${lang}"]`,
      'href',
      href,
      () => {
        const link = document.createElement('link')
        link.rel = 'alternate'
        link.hreflang = lang
        return link
      },
    )
  }
  const script =
    document.head.querySelector('script[data-seo="jsonld"]') ??
    document.head.appendChild(
      Object.assign(document.createElement('script'), {
        type: 'application/ld+json',
      }),
    )
  script.setAttribute('data-seo', 'jsonld')
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: canonical,
    name: page.title,
    description: page.description,
    isPartOf: { '@type': 'WebSite', name: 'NewWebinars', url: `${SITE_ORIGIN}/` },
  }).replaceAll('<', '\\u003c')
}
