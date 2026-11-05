import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { localeFromPath, localizedPath, type Locale } from '@/i18n/localePath'
import { guidePathForLocale } from '@/features/guides/evergreenGuide'

const languages = [
  { code: 'en', label: 'EN' },
  { code: 'lt', label: 'LT' },
  { code: 'ru', label: 'RU' },
]

export function LanguageSwitch() {
  const { i18n } = useTranslation()
  return (
    <label className="border-border bg-card text-muted-foreground flex h-10 items-center gap-1.5 rounded-full border px-3 shadow-sm">
      <Languages className="h-3.5 w-3.5" />
      <select
        aria-label="Language"
        value={i18n.language.split('-')[0]}
        onChange={(event) => {
          const next = event.target.value as Locale
          const { pathname } = localeFromPath(window.location.pathname)
          const guidePath = guidePathForLocale(pathname, next)
          const target = localizedPath(
            `${guidePath ?? pathname}${window.location.search}${window.location.hash}`,
            next,
          )
          window.location.assign(target)
        }}
        className="text-foreground bg-transparent text-xs font-semibold outline-none"
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  )
}
