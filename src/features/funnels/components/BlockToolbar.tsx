import {
  Clock,
  CreditCard,
  Gift,
  HelpCircle,
  ListChecks,
  MessageCircle,
  MousePointer,
  Play,
  Sparkles,
  Type,
  User,
  FormInput,
  ImageIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import {
  FUNNEL_BLOCK_REGISTRY,
  type FunnelBlockType,
} from '@/features/funnels/types'

const BLOCK_ICONS = {
  hero: Sparkles,
  webinar_hero: Sparkles,
  text: Type,
  image: ImageIcon,
  video: Play,
  registration_form: FormInput,
  countdown: Clock,
  benefits: ListChecks,
  speaker: User,
  chat: MessageCircle,
  cta: MousePointer,
  offer: Gift,
  order_form: CreditCard,
  faq: HelpCircle,
} as const

export function BlockToolbar({
  onAdd,
}: {
  onAdd: (type: FunnelBlockType) => void
}) {
  const { t } = useTranslation('funnels')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {(Object.keys(FUNNEL_BLOCK_REGISTRY) as FunnelBlockType[]).map(
          (type) => {
            const def = FUNNEL_BLOCK_REGISTRY[type]
            const Icon = BLOCK_ICONS[type]
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                title={t(`blocks.${type}`, def.label)}
                onClick={() => onAdd(type)}
                className="min-w-0 justify-start overflow-hidden px-2.5 text-left"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {t(`blocks.${type}`, def.label)}
                </span>
              </Button>
            )
          },
        )}
      </div>
    </div>
  )
}
