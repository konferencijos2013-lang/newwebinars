import {
  escapeHtml,
  pageUrl,
  SITE_ORIGIN,
  type MarketingPage,
  type SeoLocale,
} from '../seo/marketingPages.ts'
import {
  EVERGREEN_GUIDE,
  GUIDE_INDEX,
  GUIDE_PUBLISHED,
  guideArticlePath,
} from './evergreenGuide.ts'

function guideAlternateUrls(kind: 'index' | 'article') {
  if (kind === 'index') {
    return {
      en: pageUrl('en', '/guides'),
      lt: pageUrl('lt', '/guides'),
      ru: pageUrl('ru', '/guides'),
      'x-default': pageUrl('en', '/guides'),
    }
  }
  return {
    en: pageUrl('en', guideArticlePath('en')),
    lt: pageUrl('lt', guideArticlePath('lt')),
    ru: pageUrl('ru', guideArticlePath('ru')),
    'x-default': pageUrl('en', guideArticlePath('en')),
  }
}

const LANG = { en: 'en', lt: 'lt', ru: 'ru' } as const
const OG = { en: 'en_US', lt: 'lt_LT', ru: 'ru_RU' } as const

function articleJsonLd(locale: SeoLocale, canonical: string) {
  const article = EVERGREEN_GUIDE[locale]
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: GUIDE_PUBLISHED,
    inLanguage: LANG[locale],
    mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: 'NewWebinars', url: `${SITE_ORIGIN}/` },
  }).replaceAll('<', '\\u003c')
}

function noscriptArticle(locale: SeoLocale) {
  const article = EVERGREEN_GUIDE[locale]
  const sections = article.sections
    .map((section) => {
      const bullets = section.bullets
        ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : ''
      return `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join('')}${bullets}</section>`
    })
    .join('')
  const steps = article.visuals.process
    .map(
      (step, index) =>
        `<li><strong>${index + 1}. ${escapeHtml(step.title)}</strong> ${escapeHtml(step.text)}</li>`,
    )
    .join('')
  const rows = article.visuals.compareRows
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.aspect)}</th><td>${escapeHtml(row.live)}</td><td>${escapeHtml(row.evergreen)}</td></tr>`,
    )
    .join('')
  const funnel = article.visuals.funnel
    .map(
      (step) =>
        `<li><strong>${escapeHtml(step.title)}</strong> ${escapeHtml(step.text)}</li>`,
    )
    .join('')
  const links = guideAlternateUrls('article')
  return `<main><article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.excerpt)}</p>${sections}<h2>${escapeHtml(article.visuals.processLabel)}</h2><ol>${steps}</ol><h2>${escapeHtml(article.visuals.compareLabel)}</h2><table>${rows}</table><h2>${escapeHtml(article.visuals.funnelLabel)}</h2><ol>${funnel}</ol><nav><a href="${escapeHtml(links.en)}">English</a> <a href="${escapeHtml(links.lt)}">Lietuvių</a> <a href="${escapeHtml(links.ru)}">Русский</a> <a href="${escapeHtml(pageUrl(locale, '/'))}">NewWebinars</a> <a href="${escapeHtml(pageUrl(locale, '/pricing'))}">Pricing</a></nav></article></main>`
}

function page(
  locale: SeoLocale,
  path: string,
  title: string,
  description: string,
  kind: 'index' | 'article',
  noscript: string,
  jsonLd: string,
): MarketingPage {
  return {
    locale,
    path,
    lang: LANG[locale],
    title: `${title} — NewWebinars`,
    description,
    canonical: pageUrl(locale, path),
    robots: 'index,follow',
    ogLocale: OG[locale],
    hreflang: guideAlternateUrls(kind),
    jsonLd,
    noscript,
  }
}

export function buildGuideSeoPages(): MarketingPage[] {
  const locales: SeoLocale[] = ['en', 'lt', 'ru']
  return locales.flatMap((locale) => {
    const index = GUIDE_INDEX[locale]
    const article = EVERGREEN_GUIDE[locale]
    return [
      page(
        locale,
        '/guides',
        index.title,
        index.description,
        'index',
        `<main><h1>${escapeHtml(index.title)}</h1><p>${escapeHtml(index.intro)}</p><article><h2><a href="${escapeHtml(pageUrl(locale, guideArticlePath(locale)))}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.excerpt)}</p></article></main>`,
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: index.title,
          description: index.description,
          url: pageUrl(locale, '/guides'),
        }).replaceAll('<', '\\u003c'),
      ),
      page(
        locale,
        guideArticlePath(locale),
        article.title,
        article.description,
        'article',
        noscriptArticle(locale),
        articleJsonLd(locale, pageUrl(locale, guideArticlePath(locale))),
      ),
    ]
  })
}

export function guideLlmsLines() {
  return `
## Guide

- [What an evergreen webinar is](${pageUrl('en', guideArticlePath('en'))}): ${EVERGREEN_GUIDE.en.description}
- [Lietuviškai](${pageUrl('lt', guideArticlePath('lt'))})
- [По-русски](${pageUrl('ru', guideArticlePath('ru'))})
`
}
