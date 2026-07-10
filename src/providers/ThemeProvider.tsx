import { useEffect } from 'react'
import { applyTheme, getStoredTheme } from '@/shared/utils/storage'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return <>{children}</>
}
