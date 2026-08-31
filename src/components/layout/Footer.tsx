import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Play } from 'lucide-react'
import { openConsentSettings } from '@/features/consent/consent'

export function Footer() {
  const { t } = useTranslation(['common', 'auth', 'landing'])
  return (
    <footer className="bg-card/50 border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5 font-bold">
            <span className="bg-primary flex h-9 w-9 items-center justify-center rounded-xl text-white">
              <Play className="h-4 w-4 fill-current" />
            </span>
            NewWebinars
          </Link>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            {t('landing:hero.subheadline')}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
          <Link
            className="text-muted-foreground hover:text-foreground"
            to="/pricing"
          >
            {t('common:pricing')}
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            to="/partners"
          >
            {t('common:partners')}
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            to="/login"
          >
            {t('auth:signIn')}
          </Link>
          <Link
            className="text-primary inline-flex items-center gap-1"
            to="/webinars"
          >
            {t('landing:hero.ctaPrimary')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>
            &copy; {new Date().getFullYear()} NewWebinars.{' '}
            {t('common:footer.rights')}
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <a
              className="hover:text-foreground"
              href="mailto:mail@newwebinars.com"
            >
              {t('common:footerContact')}
            </a>
            <Link className="hover:text-foreground" to="/privacy">
              {t('common:footerPrivacyPolicy')}
            </Link>
            <Link className="hover:text-foreground" to="/terms">
              {t('common:footerTerms')}
            </Link>
            <Link className="hover:text-foreground" to="/cookie-policy">
              {t('common:footerCookiePolicy')}
            </Link>
            <button
              className="hover:text-foreground text-left"
              onClick={openConsentSettings}
            >
              {t('common:footerCookies')}
            </button>
          </span>
        </div>
      </div>
    </footer>
  )
}
