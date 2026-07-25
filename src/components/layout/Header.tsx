import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'

export function Header() {
  const { t } = useTranslation(['common', 'auth', 'landing'])

  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-foreground hover:text-primary inline-flex items-center gap-2 text-lg font-semibold transition-colors"
        >
          <PlayCircle className="text-primary h-5 w-5" />
          {t('common:appName')}
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            to="/pricing"
            className="text-muted-foreground hover:text-foreground hidden text-sm font-medium transition-colors sm:inline"
          >
            {t('common:pricing')}
          </Link>
          <Link
            to="/partners"
            className="text-muted-foreground hover:text-foreground hidden text-sm font-medium transition-colors sm:inline"
          >
            {t('common:partners')}
          </Link>
          <Link
            to="/login"
            className="text-muted-foreground hover:text-foreground hidden text-sm font-medium transition-colors sm:inline"
          >
            {t('auth:signIn')}
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
          <Link
            to="/webinars"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            {t('landing:hero.ctaPrimary')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  )
}
