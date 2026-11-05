import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '@/i18n/localePath'
import { EVERGREEN_GUIDE, GUIDE_INDEX, guideArticlePath } from '@/features/guides/evergreenGuide'
import { applyPageMeta } from './applyPageMeta'
import { pageUrl } from './marketingPages'

const INDEXED = new Set([
  '/',
  '/pricing',
  '/partners',
  '/privacy',
  '/terms',
  '/cookie-policy',
])

export function MarketingMeta() {
  const location = useLocation()
  const { t, i18n } = useTranslation(['landing', 'legal', 'common', 'auth'])
  const locale = currentLocale()
  const pathname = location.pathname || '/'

  useEffect(() => {
    const appName = t('common:appName')
    const guide = guideMeta(pathname, locale)
    const description = guide?.description ?? descriptionFor(pathname, t)
    const title = guide?.title ?? titleFor(pathname, appName, t)
    applyPageMeta({
      title,
      description,
      path: pathname,
      locale,
      index: INDEXED.has(pathname) || guide !== null,
      alternates: guide?.alternates,
    })
  }, [pathname, locale, i18n.language, t, location.pathname])

  return null
}

function guideMeta(pathname: string, locale: 'en' | 'lt' | 'ru') {
  if (pathname === '/guides') {
    const index = GUIDE_INDEX[locale]
    return {
      title: `${index.title} — NewWebinars`,
      description: index.description,
      alternates: {
        en: pageUrl('en', '/guides'),
        lt: pageUrl('lt', '/guides'),
        ru: pageUrl('ru', '/guides'),
        'x-default': pageUrl('en', '/guides'),
      },
    }
  }
  const slug = pathname.startsWith('/guides/') ? pathname.slice('/guides/'.length) : ''
  if (slug !== EVERGREEN_GUIDE[locale].slug) return null
  const article = EVERGREEN_GUIDE[locale]
  return {
    title: `${article.title} — NewWebinars`,
    description: article.description,
    alternates: {
      en: pageUrl('en', guideArticlePath('en')),
      lt: pageUrl('lt', guideArticlePath('lt')),
      ru: pageUrl('ru', guideArticlePath('ru')),
      'x-default': pageUrl('en', guideArticlePath('en')),
    },
  }
}

function titleFor(
  pathname: string,
  appName: string,
  t: (key: string) => string,
) {
  if (pathname === '/') return `${appName} — ${t('landing:hero.headline')}`
  if (pathname === '/pricing') return `${t('landing:pricing.title')} — ${appName}`
  if (pathname === '/partners') return `${t('landing:partners.title')} — ${appName}`
  if (pathname === '/privacy') return `${t('legal:privacy.title')} — ${appName}`
  if (pathname === '/terms') return `${t('legal:terms.title')} — ${appName}`
  if (pathname === '/cookie-policy') return `${t('common:cookiePolicy.title')} — ${appName}`
  if (pathname === '/login') return `${t('auth:loginTitle')} — ${appName}`
  return appName
}

function descriptionFor(pathname: string, t: (key: string) => string) {
  if (pathname === '/') return t('landing:hero.subheadline')
  if (pathname === '/pricing') return t('landing:pricing.subtitle')
  if (pathname === '/partners') return t('landing:partners.subtitle')
  if (pathname === '/privacy') return t('legal:privacy.intro')
  if (pathname === '/terms') return t('legal:terms.intro')
  if (pathname === '/cookie-policy') return t('common:cookiePolicy.intro')
  if (pathname === '/login') return t('auth:loginSubtitle')
  return t('landing:hero.subheadline')
}
