import { Outlet } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { ThemeProvider } from '@/providers/ThemeProvider'

export function PublicLayout() {
  return (
    <ThemeProvider>
      <div className="bg-background text-foreground relative flex min-h-svh flex-col overflow-x-hidden">
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_50%_-20%,color-mix(in_srgb,var(--color-primary)_15%,transparent),transparent_65%)]" />
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
