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
    <section id="how-it-works" className="py-20 lg:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('howItWorks.title')}
          </h2>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = icons[index] ?? PenLine
            return (
              <div
                key={step.title}
                className="relative flex flex-col items-center text-center"
              >
                <div className="border-border flex h-16 w-16 items-center justify-center rounded-full border text-xl font-semibold">
                  {index + 1}
                </div>
                <div className="text-primary mt-6 flex h-10 w-10 items-center justify-center rounded-lg">
                  <Icon className="h-6 w-6" />
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
