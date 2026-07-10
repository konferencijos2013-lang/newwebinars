import { useEffect, useState } from 'react'
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from '@/shared/utils/storage'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      if (getStoredTheme() === 'system') {
        applyTheme('system')
      }
    }

    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const set = (next: Theme) => {
    setStoredTheme(next)
    setTheme(next)
  }

  return { theme, set }
}
