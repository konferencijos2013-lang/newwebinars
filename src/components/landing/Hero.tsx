import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function Hero() {
  const { t } = useTranslation('landing')

  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      <Container className="relative z-10 flex flex-col items-center text-center">
        <div className="text-primary inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium">
          <PlayCircle className="mr-2 h-4 w-4" />
          NewWebinars
        </div>

        <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          <span className="from-primary bg-gradient-to-r to-indigo-500 bg-clip-text text-transparent">
            {t('hero.headline')}
          </span>
        </h1>

        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8">
          {t('hero.subheadline')}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            to="/webinars"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center gap-2 rounded-md px-8 text-base font-medium transition-colors"
          >
            {t('hero.ctaPrimary')}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how-it-works"
            className="border-border bg-background hover:bg-muted inline-flex h-11 items-center justify-center rounded-md border px-8 text-base font-medium transition-colors"
          >
            {t('hero.ctaSecondary')}
          </a>
        </div>
      </Container>

      <div className="pointer-events-none absolute inset-0 -z-10 flex justify-center">
        <div className="bg-primary/10 h-96 w-96 rounded-full blur-3xl" />
      </div>
    </section>
  )
}
