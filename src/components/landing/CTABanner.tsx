import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function CTABanner() {
  const { t } = useTranslation('landing')

  return (
    <section className="py-20 lg:py-32">
      <Container>
        <div className="from-primary relative overflow-hidden rounded-3xl bg-gradient-to-br to-indigo-600 px-6 py-16 text-center text-white sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('cta.title')}
            </h2>
            <p className="mt-4 text-lg text-white/90">{t('cta.subtitle')}</p>

            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                to="/webinars"
                className="text-primary inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-medium shadow-lg transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl"
              >
                {t('cta.button')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="inline-flex items-center gap-2 text-sm text-white/80">
                <Sparkles className="h-4 w-4" />
                {t('hero.note')}
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
