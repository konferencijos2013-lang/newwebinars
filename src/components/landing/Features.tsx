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
    <section className="bg-muted/50 py-20 lg:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('features.title')}
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const Icon = icons[index] ?? Calendar
            return (
              <div
                key={item.title}
                className="bg-card text-card-foreground rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
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
