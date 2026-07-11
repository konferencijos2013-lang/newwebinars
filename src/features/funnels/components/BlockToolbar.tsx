import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import {
  FUNNEL_BLOCK_REGISTRY,
  type FunnelBlockType,
} from '@/features/funnels/types'

export function BlockToolbar({
  onAdd,
}: {
  onAdd: (type: FunnelBlockType) => void
}) {
  const { t } = useTranslation('funnels')

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{t('addBlock')}</h4>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(FUNNEL_BLOCK_REGISTRY) as FunnelBlockType[]).map(
          (type) => {
            const def = FUNNEL_BLOCK_REGISTRY[type]
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => onAdd(type)}
                className="justify-start"
              >
                <span className="mr-2">{def.icon}</span>
                {t(`blocks.${type}`, def.label)}
              </Button>
            )
          },
        )}
      </div>
    </div>
  )
}
