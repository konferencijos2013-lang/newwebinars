import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NotFoundPage() {
  const { t } = useTranslation('common')

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <h1 className="text-4xl font-semibold">404</h1>
      <p className="text-muted-foreground mt-2">{t('error')}</p>
      <Link
        to="/"
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('open')} {t('appName')}
      </Link>
    </section>
  )
}
