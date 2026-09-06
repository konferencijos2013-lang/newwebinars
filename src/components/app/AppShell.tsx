import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { Eye, X } from 'lucide-react'
import { supportPath, useSupportView } from '@/features/support/useSupportView'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  Home,
  LayoutTemplate,
  LogOut,
  Film,
  Settings,
  Users,
  Video,
  Bot,
  ShieldCheck,
  Link2,
  Send,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/features/auth/hooks/useUser'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/shared/utils/cn'

function SidebarNavLink({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  )
}

export function AppShell() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { status, user } = useUser()
  const accountState = useAccount()
  const supportView = useSupportView()
  const path = (to: string) => supportPath(supportView?.basePath ?? null, to)
  const supportAccountLabel = supportView
    ? (accountState.account?.name ?? 'Stebima paskyra')
    : null

  async function handleSignOut() {
    // A local sign-out is deterministic even when the global Supabase request
    // cannot be reached. The session is removed from this browser immediately.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) console.error('Unable to sign out locally', error)
    navigate('/login', { replace: true })
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground flex min-h-svh">
      <aside className="border-border bg-card flex w-64 flex-col border-r">
        <div className="flex h-14 items-center border-b px-4">
          <Link
            to={path('/dashboard')}
            className="text-foreground hover:text-primary text-lg font-semibold"
          >
            {t('appName')}
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <SidebarNavLink
            to={path('/dashboard')}
            icon={Home}
            label={t('navigation.dashboard')}
            end
          />
          <SidebarNavLink
            to={path('/webinars')}
            icon={Video}
            label={t('navigation.webinars')}
          />
          <SidebarNavLink
            to={path('/funnels')}
            icon={LayoutTemplate}
            label={t('navigation.funnels')}
          />
          <SidebarNavLink
            to={path('/recordings')}
            icon={Film}
            label={t('navigation.recordings')}
          />
          {!supportView ? (
            <SidebarNavLink
              to={path('/ai')}
              icon={Bot}
              label={t('navigation.ai')}
            />
          ) : null}
          {!supportView ? (
            <SidebarNavLink
              to={path('/billing')}
              icon={BarChart3}
              label={t('navigation.billing')}
            />
          ) : null}
          {!supportView && user?.role === 'admin' ? (
            <>
              <SidebarNavLink
                to="/admin"
                icon={ShieldCheck}
                label="Administravimas"
              />
              <SidebarNavLink
                to="/admin/partners"
                icon={Users}
                label="Partneriai"
              />
            </>
          ) : null}
          {!supportView ? (
            <SidebarNavLink
              to={path('/telegram')}
              icon={Send}
              label={t('navigation.telegram')}
            />
          ) : null}
          {!supportView ? (
            <SidebarNavLink
              to={path('/integrations')}
              icon={Link2}
              label="Integracijos"
            />
          ) : null}
          {!supportView ? (
            <SidebarNavLink
              to={path('/settings')}
              icon={Settings}
              label={t('navigation.settings')}
            />
          ) : null}
        </nav>

        <div className="border-t p-3">
          <div className="mb-3 flex items-center gap-3 px-3">
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">
                {supportAccountLabel ?? user?.email ?? t('navigation.user')}
              </span>
            </div>
          </div>
          <div className="space-y-2 px-3">
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitch />
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm"
            >
              <LogOut className="h-4 w-4" />
              {t('auth:signOut')}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        {supportView ? (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4" />
              Pagalbos peržiūra: {supportAccountLabel ?? 'stebima paskyra'} —
              tik skaitymas
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(`/admin/accounts/${supportView.accountId}`)
              }
              className="flex items-center gap-1 text-sm underline"
            >
              <X className="h-4 w-4" /> Baigti peržiūrą
            </button>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  )
}
