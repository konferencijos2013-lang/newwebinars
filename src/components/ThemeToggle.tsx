import { useTheme } from '@/hooks/useTheme'
import { type Theme } from '@/shared/utils/storage'

const options: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle() {
  const { theme, set } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">Theme</span>
      <select
        value={theme}
        onChange={(event) => set(event.target.value as Theme)}
        className="border-border bg-card rounded-md border px-2 py-1 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
