import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  ArrowRight,
  BarChart3,
  Check,
  MessageCircle,
  Play,
  Sparkles,
  Users,
} from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function Hero() {
  const { t } = useTranslation('landing')
  return (
    <section className="relative overflow-hidden pt-14 pb-24 sm:pt-20 lg:pt-24 lg:pb-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-[5%] h-[32rem] w-[32rem] rounded-full bg-violet-400/15 blur-[110px]" />
        <div className="absolute top-10 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-cyan-300/15 blur-[120px]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_72%)] [background-size:48px_48px] opacity-35" />
      </div>
      <Container className="max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <div className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" />
                <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
              </span>
              {t('hero.eyebrow')}
            </div>
            <h1 className="mt-7 text-5xl leading-[0.98] font-bold tracking-[-0.055em] sm:text-6xl lg:text-[4.7rem]">
              {t('hero.headline').split(' ').slice(0, -1).join(' ')}{' '}
              <span className="from-primary bg-gradient-to-r via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                {t('hero.headline').split(' ').slice(-1)}
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-7 max-w-xl text-lg leading-8 lg:mx-0 lg:text-xl">
              {t('hero.subheadline')}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                to="/webinars"
                className="from-primary text-primary-foreground shadow-primary/20 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-gradient-to-r to-violet-500 px-7 font-semibold shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
              >
                {t('hero.ctaPrimary')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="bg-card/80 inline-flex h-13 items-center justify-center gap-2 rounded-full border px-7 font-semibold shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <Play className="text-primary h-4 w-4 fill-current" />
                {t('hero.ctaSecondary')}
              </a>
            </div>
            <div className="text-muted-foreground mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <Check className="text-primary h-4 w-4" />
                {t('hero.note')}
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl [perspective:1200px]">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-r from-violet-500/20 to-cyan-400/20 blur-3xl" />
            <div className="border-border/80 bg-card/90 relative overflow-hidden rounded-[1.6rem] border p-2.5 shadow-[0_30px_90px_-28px_rgba(53,43,124,0.45)] backdrop-blur-xl lg:rotate-[1deg]">
              <div className="overflow-hidden rounded-[1.15rem] border bg-[#101225]">
                <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="rounded-full bg-white/8 px-3 py-1 text-[10px] text-white/60">
                    newwebinars.com/live
                  </div>
                  <div className="w-10" />
                </div>
                <div className="grid min-h-[330px] grid-cols-[1fr_150px] sm:min-h-[390px] sm:grid-cols-[1fr_190px]">
                  <div className="relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#5f55ae,#22243c_58%,#151625)]">
                    <div className="absolute inset-x-6 top-5 bottom-5 rounded-2xl border border-white/10 bg-white/5" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur">
                      <Play className="ml-1 h-8 w-8 fill-current" />
                    </div>
                    <div className="absolute top-5 left-5 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      {t('hero.liveLabel')}
                    </div>
                    <div className="absolute right-5 bottom-5 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur">
                      <Users className="h-3.5 w-3.5" />
                      128
                    </div>
                  </div>
                  <div className="border-l border-white/10 bg-[#17192a] p-3 sm:p-4">
                    <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-white">
                      <MessageCircle className="h-4 w-4 text-violet-400" />
                      Live chat
                    </div>
                    {[
                      ['AM', 'Amazing insight!'],
                      ['JK', 'Can you show us?'],
                      ['LS', 'This is great 👏'],
                    ].map(([name, message], index) => (
                      <div
                        key={name}
                        className="mb-3 rounded-xl bg-white/[0.06] p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-bold text-white ${index === 1 ? 'bg-cyan-500' : 'bg-violet-500'}`}
                          >
                            {name}
                          </span>
                          <span className="hidden text-[10px] text-white/45 sm:inline">
                            Participant
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-white/75">
                          {message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card absolute -bottom-7 -left-4 hidden items-center gap-3 rounded-2xl border p-3.5 shadow-xl sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <div className="text-muted-foreground text-xs">Conversion</div>
                <div className="text-lg font-bold">
                  24.8% <span className="text-xs text-emerald-500">↑ 8.2%</span>
                </div>
              </div>
            </div>
            <div className="bg-card absolute -top-6 -right-3 hidden items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl sm:flex">
              <Sparkles className="text-primary h-4 w-4" />
              All-in-one
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
