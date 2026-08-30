import { useTranslation } from 'react-i18next'
import { MoonStar } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { type Theme } from '@/shared/utils/storage'

const values: Theme[] = ['light', 'dark', 'system']

export function ThemeToggle() {
  const { t } = useTranslation('common')
  const { theme, set } = useTheme()
  return (
    <label className="border-border bg-card text-muted-foreground flex h-10 items-center gap-1.5 rounded-full border px-3 shadow-sm">
      <MoonStar className="h-3.5 w-3.5" />
      <select
        aria-label={t('theme.label')}
        value={theme}
        onChange={(event) => set(event.target.value as Theme)}
        className="text-foreground max-w-16 bg-transparent text-xs font-semibold outline-none"
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`theme.${value}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
