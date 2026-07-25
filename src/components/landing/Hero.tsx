import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, PlayCircle, Users, Sparkles } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function Hero() {
  const { t } = useTranslation('landing')

  return (
    <section className="relative overflow-hidden pt-20 pb-24 lg:pt-28 lg:pb-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-primary/25 absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div
          className="absolute inset-0 [mask-image:radial-gradient(ellipse_55%_55%_at_50%_0%,black,transparent)] opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="text-primary bg-primary/5 border-primary/20 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium backdrop-blur-sm">
              <PlayCircle className="h-4 w-4" />
              NewWebinars
            </div>

            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
              <span className="from-primary bg-gradient-to-r to-indigo-500 bg-clip-text text-transparent">
                {t('hero.headline')}
              </span>
            </h1>

            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
              {t('hero.subheadline')}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <Link
                to="/webinars"
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25 inline-flex h-12 items-center justify-center gap-2 rounded-full px-8 text-base font-medium shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                {t('hero.ctaPrimary')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="border-border bg-background/60 hover:bg-muted inline-flex h-12 items-center justify-center rounded-full border px-8 text-base font-medium backdrop-blur-sm transition-colors"
              >
                {t('hero.ctaSecondary')}
              </a>
            </div>

            <p className="text-muted-foreground mt-6 inline-flex items-center gap-2 text-sm">
              <Sparkles className="text-primary h-4 w-4" />
              {t('hero.note')}
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            <div className="border-border bg-card/90 relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur">
              <div className="border-border bg-muted/40 flex items-center gap-1.5 border-b px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
              </div>

              <div className="from-primary/25 relative flex aspect-video items-center justify-center bg-gradient-to-br to-indigo-500/25">
                <div className="bg-background/90 flex h-14 w-14 items-center justify-center rounded-full shadow-lg">
                  <PlayCircle className="text-primary h-7 w-7" />
                </div>
                <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  {t('hero.liveLabel')}
                </div>
                <div className="bg-background/90 text-foreground absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow">
                  <Users className="h-3 w-3" />
                  128
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/20 h-6 w-6 shrink-0 rounded-full" />
                  <div className="bg-muted h-3 w-3/4 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 shrink-0 rounded-full bg-indigo-400/30" />
                  <div className="bg-muted h-3 w-1/2 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-primary/20 h-6 w-6 shrink-0 rounded-full" />
                  <div className="bg-muted h-3 w-2/3 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
