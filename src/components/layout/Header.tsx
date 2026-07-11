import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'

export function Header() {
  const { t } = useTranslation(['common', 'auth'])

  return (
    <header className="border-border bg-card border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="text-foreground hover:text-primary text-lg font-semibold"
        >
          {t('common:appName')}
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            to="/pricing"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {t('common:pricing', 'Pricing')}
          </Link>
          <Link
            to="/partners"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {t('common:partners', 'Partners')}
          </Link>
          <Link
            to="/login"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {t('auth:signIn')}
          </Link>
          <LanguageSwitch />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
