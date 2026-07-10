import { Outlet } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { ThemeProvider } from '@/providers/ThemeProvider'

export function RootLayout() {
  return (
    <ThemeProvider>
      <div className="bg-background text-foreground flex min-h-svh flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
