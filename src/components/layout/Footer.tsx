import { useTranslation } from 'react-i18next'
import { PlayCircle } from 'lucide-react'

export function Footer() {
  const { t } = useTranslation('common')

  return (
    <footer className="border-border bg-card/60 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:text-left">
        <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold">
          <PlayCircle className="text-primary h-4 w-4" />
          NewWebinars
        </div>
        <p className="text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} NewWebinars. {t('footer.rights')}
        </p>
      </div>
    </footer>
  )
}
