import { useTranslation } from 'react-i18next'
import {
  Video,
  Calendar,
  LayoutTemplate,
  DoorOpen,
  MessageSquare,
  Mail,
  BarChart3,
} from 'lucide-react'
import { Container } from '@/components/ui/Container'

const icons = [Video, LayoutTemplate, DoorOpen, MessageSquare, Mail, BarChart3]

export function Features() {
  const { t } = useTranslation('landing')
  const items = t('features.items', { returnObjects: true }) as Array<{
    title: string
    description: string
  }>

  return (
    <section className="relative py-20 lg:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-primary text-sm font-semibold tracking-wide uppercase">
            {t('features.eyebrow')}
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('features.title')}
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const Icon = icons[index] ?? Calendar
            return (
              <div
                key={item.title}
                className="group bg-card/60 border-border hover:border-primary/30 relative overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="from-primary/10 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="from-primary text-primary-foreground shadow-primary/20 relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br to-indigo-500 shadow-lg">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="relative mt-5 text-lg font-semibold">
                  {item.title}
                </h3>
                <p className="text-muted-foreground relative mt-2 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
