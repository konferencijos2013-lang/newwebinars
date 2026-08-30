import { useTranslation } from 'react-i18next'
import {
  Video,
  LayoutTemplate,
  DoorOpen,
  MessageSquare,
  Mail,
  BarChart3,
  ArrowUpRight,
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
    <section className="py-24 lg:py-32">
      <Container className="max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div>
            <span className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
              {t('features.eyebrow')}
            </span>
            <h2 className="mt-4 max-w-lg text-4xl leading-tight font-bold tracking-[-0.035em] sm:text-5xl">
              {t('features.title')}
            </h2>
          </div>
          <p className="text-muted-foreground max-w-lg text-lg leading-8 lg:justify-self-end">
            {t('features.subtitle')}
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const Icon = icons[index] ?? Video
            return (
              <article
                key={item.title}
                className={`group bg-card hover:border-primary/30 relative overflow-hidden rounded-3xl border p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${index === 0 ? 'md:col-span-2 lg:col-span-1' : ''}`}
              >
                <div className="bg-primary/5 absolute -top-12 -right-12 h-32 w-32 rounded-full transition-transform group-hover:scale-150" />
                <div className="relative flex items-start justify-between">
                  <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="text-muted-foreground/40 group-hover:text-primary h-5 w-5 transition-all group-hover:translate-x-1 group-hover:-translate-y-1" />
                </div>
                <h3 className="relative mt-8 text-xl font-bold tracking-tight">
                  {item.title}
                </h3>
                <p className="text-muted-foreground relative mt-3 text-sm leading-6">
                  {item.description}
                </p>
              </article>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
