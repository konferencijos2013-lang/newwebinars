const THEME_KEY = 'nw:theme'

export type Theme = 'light' | 'dark' | 'system'

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getStoredTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY)
  return isTheme(value) ? value : 'system'
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme)
  const root = document.documentElement

  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
