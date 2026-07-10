import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'

export function Header() {
  const { t } = useTranslation('common')

  return (
    <header className="border-border bg-card border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-foreground hover:text-primary text-lg font-semibold"
        >
          {t('appName', 'NewWebinars')}
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            to="/webinars"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {t('webinars:title', 'Webinars')}
          </Link>
          <LanguageSwitch />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
