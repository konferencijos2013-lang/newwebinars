export const SITE_ORIGIN = 'https://newwebinars.com'

export const SEO_LOCALES = ['en', 'lt', 'ru'] as const

export type SeoLocale = (typeof SEO_LOCALES)[number]

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/webinars',
  '/funnels',
  '/recordings',
  '/analytics',
  '/affiliate',
  '/ai',
  '/admin',
  '/billing',
  '/settings',
  '/invite',
  '/integrations',
  '/telegram',
  '/mail',
  '/support',
  '/auth',
]

export function isPrivatePath(pathname: string) {
  const bare = pathname.replace(/^\/(lt|ru)(?=\/|$)/, '') || '/'
  return PRIVATE_PREFIXES.some(
    (prefix) => bare === prefix || bare.startsWith(`${prefix}/`),
  )
}

export function pageUrl(locale: SeoLocale, path: string) {
  const prefix = locale === 'en' ? '' : `/${locale}`
  if (path === '/') return `${SITE_ORIGIN}${prefix || '/'}`
  return `${SITE_ORIGIN}${prefix}${path}`
}

export function outputHtmlPath(locale: SeoLocale, path: string) {
  const prefix = locale === 'en' ? '' : `${locale}/`
  if (path === '/') return `${prefix}index.html`
  return `${prefix}${path.slice(1)}/index.html`
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type Feature = { title: string; description: string }
type Step = { title: string; description: string }
type Plan = { name: string; price: string }

export type MarketingCopy = {
  appName: string
  hero: { headline: string; subheadline: string }
  features: { title: string; subtitle: string; items: Feature[] }
  howItWorks: { title: string; steps: Step[] }
  cta: { title: string; subtitle: string; button: string }
  pricing: { title: string; subtitle: string; plans: Plan[] }
  partners: {
    title: string
    subtitle: string
    commissionTitle: string
    commissionDescription: string
  }
  privacy: { title: string; intro: string; sections: Step[] }
  terms: { title: string; intro: string; sections: Step[] }
  cookies: { title: string; intro: string; sections: Step[] }
  login: { title: string; subtitle: string }
}

export type MarketingPage = {
  locale: SeoLocale
  path: string
  lang: string
  title: string
  description: string
  canonical: string
  robots: string
  ogLocale: string
  hreflang: Record<string, string>
  jsonLd: string
  noscript: string
}

const OG_LOCALE: Record<SeoLocale, string> = {
  en: 'en_US',
  lt: 'lt_LT',
  ru: 'ru_RU',
}

const HTML_LANG: Record<SeoLocale, string> = {
  en: 'en',
  lt: 'lt',
  ru: 'ru',
}

const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/partners',
  '/privacy',
  '/terms',
  '/cookie-policy',
] as const

function hreflang(path: string) {
  return {
    en: pageUrl('en', path),
    lt: pageUrl('lt', path),
    ru: pageUrl('ru', path),
    'x-default': pageUrl('en', path),
  }
}

function paragraphs(sections: Step[]) {
  return sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p></section>`,
    )
    .join('')
}

function links(locale: SeoLocale) {
  const items: [string, string][] = [
    ['/', 'NewWebinars'],
    ['/pricing', 'Pricing'],
    ['/partners', 'Partners'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/cookie-policy', 'Cookies'],
  ]
  return `<nav>${items
    .map(
      ([path, label]) =>
        `<a href="${escapeHtml(pageUrl(locale, path))}">${label}</a>`,
    )
    .join(' ')}</nav>`
}

function pageBody(copy: MarketingCopy, path: string, locale: SeoLocale) {
  const nav = links(locale)
  if (path === '/') {
    return `<main><h1>${escapeHtml(copy.hero.headline)}</h1><p>${escapeHtml(copy.hero.subheadline)}</p><h2>${escapeHtml(copy.features.title)}</h2><p>${escapeHtml(copy.features.subtitle)}</p><ul>${copy.features.items
      .map(
        (item) =>
          `<li><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.description)}</li>`,
      )
      .join('')}</ul><h2>${escapeHtml(copy.howItWorks.title)}</h2><ol>${copy.howItWorks.steps
      .map(
        (step) =>
          `<li><strong>${escapeHtml(step.title)}</strong> ${escapeHtml(step.description)}</li>`,
      )
      .join('')}</ol><h2>${escapeHtml(copy.cta.title)}</h2><p>${escapeHtml(copy.cta.subtitle)}</p>${nav}</main>`
  }
  if (path === '/pricing') {
    return `<main><h1>${escapeHtml(copy.pricing.title)}</h1><p>${escapeHtml(copy.pricing.subtitle)}</p><ul>${copy.pricing.plans
      .map(
        (plan) =>
          `<li><strong>${escapeHtml(plan.name)}</strong> ${escapeHtml(plan.price)}</li>`,
      )
      .join('')}</ul>${nav}</main>`
  }
  if (path === '/partners') {
    return `<main><h1>${escapeHtml(copy.partners.title)}</h1><p>${escapeHtml(copy.partners.subtitle)}</p><h2>${escapeHtml(copy.partners.commissionTitle)}</h2><p>${escapeHtml(copy.partners.commissionDescription)}</p>${nav}</main>`
  }
  if (path === '/privacy') {
    return `<main><h1>${escapeHtml(copy.privacy.title)}</h1><p>${escapeHtml(copy.privacy.intro)}</p>${paragraphs(copy.privacy.sections)}${nav}</main>`
  }
  if (path === '/terms') {
    return `<main><h1>${escapeHtml(copy.terms.title)}</h1><p>${escapeHtml(copy.terms.intro)}</p>${paragraphs(copy.terms.sections)}${nav}</main>`
  }
  return `<main><h1>${escapeHtml(copy.cookies.title)}</h1><p>${escapeHtml(copy.cookies.intro)}</p>${paragraphs(copy.cookies.sections)}${nav}</main>`
}

function jsonLd(copy: MarketingCopy, path: string, canonical: string) {
  const organization = {
    '@type': 'Organization',
    name: copy.appName,
    url: `${SITE_ORIGIN}/`,
    email: 'mail@newwebinars.com',
  }
  const webPage = {
    '@type': 'WebPage',
    url: canonical,
    name: copy.hero.headline,
    description: copy.hero.subheadline,
    inLanguage: ['en', 'lt', 'ru'],
    isPartOf: { '@type': 'WebSite', name: copy.appName, url: `${SITE_ORIGIN}/` },
  }
  const graph =
    path === '/'
      ? [
          organization,
          {
            '@type': 'WebSite',
            name: copy.appName,
            url: `${SITE_ORIGIN}/`,
            inLanguage: ['en', 'lt', 'ru'],
            description: copy.hero.subheadline,
          },
          {
            '@type': 'SoftwareApplication',
            name: copy.appName,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: `${SITE_ORIGIN}/`,
            description: copy.hero.subheadline,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'EUR',
            },
          },
        ]
      : [organization, webPage]
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replaceAll('<', '\\u003c')
}

function titleFor(copy: MarketingCopy, path: string) {
  if (path === '/') return `${copy.appName} — ${copy.hero.headline}`
  if (path === '/pricing') return `${copy.pricing.title} — ${copy.appName}`
  if (path === '/partners') return `${copy.partners.title} — ${copy.appName}`
  if (path === '/privacy') return `${copy.privacy.title} — ${copy.appName}`
  if (path === '/terms') return `${copy.terms.title} — ${copy.appName}`
  return `${copy.cookies.title} — ${copy.appName}`
}

function descriptionFor(copy: MarketingCopy, path: string) {
  if (path === '/') return copy.hero.subheadline
  if (path === '/pricing') return copy.pricing.subtitle
  if (path === '/partners') return copy.partners.subtitle
  if (path === '/privacy') return copy.privacy.intro
  if (path === '/terms') return copy.terms.intro
  return copy.cookies.intro
}

export function buildMarketingPages(
  copies: Record<SeoLocale, MarketingCopy>,
): MarketingPage[] {
  const pages: MarketingPage[] = []
  for (const locale of SEO_LOCALES) {
    const copy = copies[locale]
    for (const path of PUBLIC_PATHS) {
      const canonical = pageUrl(locale, path)
      const title = titleFor(copy, path)
      pages.push({
        locale,
        path,
        lang: HTML_LANG[locale],
        title,
        description: descriptionFor(copy, path),
        canonical,
        robots: 'index,follow',
        ogLocale: OG_LOCALE[locale],
        hreflang: hreflang(path),
        jsonLd: jsonLd(
          {
            ...copy,
            hero: {
              headline: title,
              subheadline: descriptionFor(copy, path),
            },
          },
          path,
          canonical,
        ),
        noscript: pageBody(copy, path, locale),
      })
    }
  }
  return pages
}

export function renderMarketingHtml(shell: string, page: MarketingPage) {
  const alternates = Object.entries(page.hreflang)
    .map(
      ([lang, href]) =>
        `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(href)}" />`,
    )
    .join('\n    ')
  return shell
    .replaceAll('__SEO_LANG__', page.lang)
    .replaceAll('__SEO_TITLE__', escapeHtml(page.title))
    .replaceAll('__SEO_DESCRIPTION__', escapeHtml(page.description))
    .replaceAll('__SEO_CANONICAL__', escapeHtml(page.canonical))
    .replaceAll('__SEO_ROBOTS__', page.robots)
    .replaceAll('__SEO_OG_LOCALE__', page.ogLocale)
    .replaceAll('__SEO_HREFLANG__', alternates)
    .replaceAll('__SEO_JSONLD__', page.jsonLd)
    .replaceAll('__SEO_NOSCRIPT__', page.noscript)
}

export function sitemapXml(pages: MarketingPage[]) {
  const urls = pages
    .map((page) => {
      const alternates = Object.entries(page.hreflang)
        .map(
          ([lang, href]) =>
            `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeHtml(href)}"/>`,
        )
        .join('\n')
      return `  <url>\n    <loc>${escapeHtml(page.canonical)}</loc>\n${alternates}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
}

export function llmsText(copy: MarketingCopy) {
  const plans = copy.pricing.plans
    .map((plan) => `- ${plan.name}: ${plan.price}`)
    .join('\n')
  const features = copy.features.items
    .map((item) => `- ${item.title}: ${item.description}`)
    .join('\n')
  return `# ${copy.appName}

> ${copy.hero.headline}. ${copy.hero.subheadline}

${copy.appName} is a web platform for evergreen and live webinars. One recording can run on a schedule or when someone registers. Chat messages can appear on the video timeline. An offer can appear at a chosen minute, and the attendee pays the host through the host's own Paysera, Stripe, or PayPal account. The interface and reminder messages can be Lithuanian, English, or Russian.

This file describes the product. It does not include customer revenue totals or conversion rates.

## Product facts

${features}

## How it works

${copy.howItWorks.steps.map((step, index) => `${index + 1}. ${step.title}. ${step.description}`).join('\n')}

## Pricing

${copy.pricing.subtitle}

${plans}

Annual billing for paid plans saves 20%.

## Partner program

${copy.partners.subtitle}

${copy.partners.commissionTitle}. ${copy.partners.commissionDescription}

## Languages

- English: ${pageUrl('en', '/')}
- Lithuanian: ${pageUrl('lt', '/')}
- Russian: ${pageUrl('ru', '/')}

## Pages

- [Home](${pageUrl('en', '/')}): ${copy.hero.subheadline}
- [Pricing](${pageUrl('en', '/pricing')}): ${copy.pricing.subtitle}
- [Partners](${pageUrl('en', '/partners')}): ${copy.partners.subtitle}
- [Privacy](${pageUrl('en', '/privacy')}): ${copy.privacy.intro}
- [Terms](${pageUrl('en', '/terms')}): ${copy.terms.intro}
- [Cookies](${pageUrl('en', '/cookie-policy')}): ${copy.cookies.intro}

## Contact

Operator: Virginijus Guoga. Email: mail@newwebinars.com. Website: ${SITE_ORIGIN}/
`
}

export function robotsTxt() {
  const rules = ['User-agent: *', 'Allow: /']
  for (const prefix of ['', '/lt', '/ru']) {
    for (const path of PRIVATE_PREFIXES) {
      rules.push(`Disallow: ${prefix}${path}`)
    }
  }
  rules.push(
    '',
    '# Public product pages may be read by search and AI crawlers.',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  )
  return rules.join('\n')
}
