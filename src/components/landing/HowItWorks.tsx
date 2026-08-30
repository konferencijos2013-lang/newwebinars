import { useTranslation } from 'react-i18next'
import { PenLine, Share2, Presentation, ArrowRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'
const icons = [PenLine, Share2, Presentation]
export function HowItWorks() {
  const { t } = useTranslation('landing')
  const steps = t('howItWorks.steps', { returnObjects: true }) as Array<{
    title: string
    description: string
  }>
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden border-y bg-[#111326] py-24 text-white lg:py-32"
    >
      <div className="absolute inset-0 [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:30px_30px] opacity-10" />
      <Container className="relative max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-xs font-bold tracking-[0.18em] text-violet-300 uppercase">
            {t('howItWorks.eyebrow')}
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            {t('howItWorks.title')}
          </h2>
        </div>
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = icons[index] ?? PenLine
            return (
              <div
                key={step.title}
                className="group relative rounded-3xl border border-white/10 bg-white/[0.055] p-7 backdrop-blur"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-5xl font-bold text-white/[0.08]">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-8 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  {step.description}
                </p>
                {index < steps.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-4 z-10 hidden h-5 w-5 text-violet-300 md:block" />
                )}
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
