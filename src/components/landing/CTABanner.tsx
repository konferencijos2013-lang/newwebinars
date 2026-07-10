import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function CTABanner() {
  const { t } = useTranslation('landing')

  return (
    <section className="py-20 lg:py-32">
      <Container>
        <div className="from-primary relative overflow-hidden rounded-2xl border bg-gradient-to-br to-indigo-600 px-6 py-16 text-center text-white sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('cta.title')}
          </h2>
          <p className="mt-4 text-lg text-white/90">{t('cta.subtitle')}</p>

          <Link
            to="/webinars"
            className="text-primary mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-8 text-base font-medium transition-colors hover:bg-white/90"
          >
            {t('cta.button')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </section>
  )
}
