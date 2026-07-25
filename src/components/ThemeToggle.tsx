import { useTranslation } from 'react-i18next'
import { useTheme } from '@/hooks/useTheme'
import { type Theme } from '@/shared/utils/storage'

const values: Theme[] = ['light', 'dark', 'system']

export function ThemeToggle() {
  const { t } = useTranslation('common')
  const { theme, set } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">{t('theme.label')}</span>
      <select
        value={theme}
        onChange={(event) => set(event.target.value as Theme)}
        className="border-border bg-card rounded-md border px-2 py-1 text-sm"
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`theme.${value}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
