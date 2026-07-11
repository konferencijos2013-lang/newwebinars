import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { BlockToolbar } from './BlockToolbar'
import { BlockRenderer } from './BlockRenderer'
import {
  FUNNEL_BLOCK_REGISTRY,
  type FunnelBlockType,
} from '@/features/funnels/types'
import { upsertBlock, deleteBlock } from '@/features/funnels/api/funnels'
import type { FunnelBlock, FunnelPage } from '@/shared/database.types'

export function FunnelEditor({
  page,
  initialBlocks,
  onChange,
}: {
  page: FunnelPage
  initialBlocks: FunnelBlock[]
  onChange?: (blocks: FunnelBlock[]) => void
}) {
  const { t } = useTranslation('funnels')
  const [blocks, setBlocks] = useState<FunnelBlock[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedBlock = blocks.find((b) => b.id === selectedId)

  const handleAdd = useCallback(
    async (type: FunnelBlockType) => {
      const def = FUNNEL_BLOCK_REGISTRY[type]
      const newBlock: Partial<FunnelBlock> & {
        page_id: string
        block_type: string
      } = {
        page_id: page.id,
        block_type: type,
        sort_order: blocks.length,
        content: def.defaultContent,
        settings: def.defaultSettings,
      }
      try {
        const saved = await upsertBlock(newBlock)
        const next = [...blocks, saved]
        setBlocks(next)
        setSelectedId(saved.id)
        onChange?.(next)
      } catch (err) {
        console.error('Failed to add block', err)
      }
    },
    [blocks, onChange, page.id],
  )

  const handleRemove = useCallback(
    async (id: string) => {
      try {
        await deleteBlock(id)
        const next = blocks.filter((b) => b.id !== id)
        setBlocks(next)
        if (selectedId === id) setSelectedId(null)
        onChange?.(next)
      } catch (err) {
        console.error('Failed to remove block', err)
      }
    },
    [blocks, onChange, selectedId],
  )

  const handleUpdateContent = useCallback(
    async (id: string, content: Record<string, unknown>) => {
      setSaving(true)
      try {
        const block = blocks.find((b) => b.id === id)
        if (!block) return
        const saved = await upsertBlock({
          ...block,
          content,
        })
        const next = blocks.map((b) => (b.id === id ? saved : b))
        setBlocks(next)
        onChange?.(next)
      } catch (err) {
        console.error('Failed to update block', err)
      } finally {
        setSaving(false)
      }
    },
    [blocks, onChange],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr_280px]">
      <Card className="h-fit">
        <BlockToolbar onAdd={handleAdd} />
      </Card>

      <div className="space-y-4">
        {blocks.map((block) => (
          <div
            key={block.id}
            onClick={() => setSelectedId(block.id)}
            className={`cursor-pointer rounded-lg transition-shadow ${
              selectedId === block.id
                ? 'ring-primary ring-2'
                : 'hover:shadow-sm'
            }`}
          >
            <BlockRenderer block={block} isPreview />
          </div>
        ))}
        {blocks.length === 0 && (
          <Card className="py-12 text-center">
            <p className="text-muted-foreground">{t('emptyBlocks')}</p>
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <h4 className="text-sm font-semibold">{t('blockSettings')}</h4>
        {selectedBlock ? (
          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground text-sm capitalize">
              {t(
                `blocks.${selectedBlock.block_type}`,
                selectedBlock.block_type,
              )}
            </p>
            <SimpleBlockEditor
              block={selectedBlock}
              onChange={(content) =>
                handleUpdateContent(selectedBlock.id, content)
              }
              saving={saving}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => handleRemove(selectedBlock.id)}
            >
              {t('removeBlock')}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            {t('selectBlock')}
          </p>
        )}
      </Card>
    </div>
  )
}

function SimpleBlockEditor({
  block,
  onChange,
  saving,
}: {
  block: FunnelBlock
  onChange: (content: Record<string, unknown>) => void
  saving: boolean
}) {
  const { t } = useTranslation('funnels')
  const content = (block.content as Record<string, unknown>) || {}

  return (
    <div className="space-y-3">
      {block.block_type === 'hero' && (
        <>
          <label className="block text-sm font-medium">{t('heroTitle')}</label>
          <input
            className="border-border w-full rounded-md border px-2 py-1 text-sm"
            value={(content.title as string) ?? ''}
            onChange={(e) => onChange({ ...content, title: e.target.value })}
          />
          <label className="block text-sm font-medium">
            {t('heroSubtitle')}
          </label>
          <input
            className="border-border w-full rounded-md border px-2 py-1 text-sm"
            value={(content.subtitle as string) ?? ''}
            onChange={(e) => onChange({ ...content, subtitle: e.target.value })}
          />
        </>
      )}
      {block.block_type === 'text' && (
        <>
          <label className="block text-sm font-medium">
            {t('textContent')}
          </label>
          <textarea
            rows={5}
            className="border-border w-full rounded-md border px-2 py-1 text-sm"
            value={(content.text as string) ?? ''}
            onChange={(e) => onChange({ ...content, text: e.target.value })}
          />
        </>
      )}
      {block.block_type === 'cta' && (
        <>
          <label className="block text-sm font-medium">{t('ctaText')}</label>
          <input
            className="border-border w-full rounded-md border px-2 py-1 text-sm"
            value={(content.text as string) ?? ''}
            onChange={(e) => onChange({ ...content, text: e.target.value })}
          />
          <label className="block text-sm font-medium">{t('ctaUrl')}</label>
          <input
            className="border-border w-full rounded-md border px-2 py-1 text-sm"
            value={(content.url as string) ?? ''}
            onChange={(e) => onChange({ ...content, url: e.target.value })}
          />
        </>
      )}
      {saving && <p className="text-muted-foreground text-xs">{t('saving')}</p>}
      {!['hero', 'text', 'cta'].includes(block.block_type) && (
        <p className="text-muted-foreground text-xs">
          {t('editorPlaceholder')}
        </p>
      )}
    </div>
  )
}
