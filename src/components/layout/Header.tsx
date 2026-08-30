import { Link, NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Menu, Play, X } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { cn } from '@/shared/utils/cn'

export function Header() {
  const { t } = useTranslation(['common', 'auth', 'landing'])
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/pricing', label: t('common:pricing') },
    { to: '/partners', label: t('common:partners') },
    { to: '/login', label: t('auth:signIn') },
  ]

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="group inline-flex items-center gap-2.5 font-bold tracking-tight"
        >
          <span className="from-primary shadow-primary/20 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br to-violet-400 text-white shadow-lg transition-transform group-hover:scale-105 group-hover:rotate-3">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <span className="text-[1.05rem]">{t('common:appName')}</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitch />
          <ThemeToggle />
          <Link
            to="/webinars"
            className="bg-foreground text-background ml-1 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            {t('landing:hero.ctaPrimary')}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="bg-card flex h-10 w-10 items-center justify-center rounded-xl border lg:hidden"
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="bg-background/95 border-t px-4 py-4 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className="hover:bg-muted rounded-xl px-4 py-3 text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t pt-4">
              <LanguageSwitch />
              <ThemeToggle />
            </div>
            <Link
              to="/webinars"
              onClick={() => setOpen(false)}
              className="bg-primary text-primary-foreground mt-3 flex h-11 items-center justify-center gap-2 rounded-xl font-semibold"
            >
              {t('landing:hero.ctaPrimary')}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
