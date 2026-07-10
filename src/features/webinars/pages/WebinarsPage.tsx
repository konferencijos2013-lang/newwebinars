import { useTranslation } from 'react-i18next'

export function WebinarsPage() {
  const { t } = useTranslation('webinars')

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('noWebinars')}</p>
    </section>
  )
}
