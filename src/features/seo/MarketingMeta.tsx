import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { localeFromPath } from '@/i18n/localePath'
import { applyPageMeta } from './applyPageMeta'

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
  const { locale, pathname } = localeFromPath(location.pathname)

  useEffect(() => {
    const appName = t('common:appName')
    const description = descriptionFor(pathname, t)
    const title = titleFor(pathname, appName, t)
    applyPageMeta({
      title,
      description,
      path: pathname,
      locale,
      index: INDEXED.has(pathname),
    })
  }, [pathname, locale, i18n.language, t, location.pathname])

  return null
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
