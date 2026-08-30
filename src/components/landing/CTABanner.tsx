import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'
import { Container } from '@/components/ui/Container'
export function CTABanner() {
  const { t } = useTranslation('landing')
  return (
    <section className="py-24 lg:py-32">
      <Container className="max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="from-primary shadow-primary/20 relative overflow-hidden rounded-[2rem] bg-gradient-to-br via-violet-600 to-fuchsia-600 px-6 py-16 text-center text-white shadow-2xl sm:px-12 sm:py-20">
          <div className="absolute inset-0 [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
          <div className="absolute -top-32 -right-20 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wider uppercase">
              <Check className="h-3.5 w-3.5" />
              {t('hero.note')}
            </span>
            <h2 className="mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              {t('cta.title')}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/75">
              {t('cta.subtitle')}
            </p>
            <Link
              to="/webinars"
              className="text-primary mt-9 inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 font-bold shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
            >
              {t('cta.button')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}
