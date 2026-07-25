import { useTranslation } from 'react-i18next'
import { PenLine, Share2, Presentation } from 'lucide-react'
import { Container } from '@/components/ui/Container'

const icons = [PenLine, Share2, Presentation]

export function HowItWorks() {
  const { t } = useTranslation('landing')
  const steps = t('howItWorks.steps', { returnObjects: true }) as Array<{
    title: string
    description: string
  }>

  return (
    <section id="how-it-works" className="bg-muted/40 py-20 lg:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-primary text-sm font-semibold tracking-wide uppercase">
            {t('howItWorks.eyebrow')}
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('howItWorks.title')}
          </h2>
        </div>

        <div className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          <div className="border-border absolute top-8 left-0 hidden w-full border-t border-dashed md:block" />

          {steps.map((step, index) => {
            const Icon = icons[index] ?? PenLine
            return (
              <div
                key={step.title}
                className="relative flex flex-col items-center text-center"
              >
                <div className="from-primary text-primary-foreground shadow-primary/25 relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br to-indigo-500 text-xl font-semibold shadow-lg">
                  {index + 1}
                </div>
                <div className="bg-card border-border text-primary mt-5 flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
