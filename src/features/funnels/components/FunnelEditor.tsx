import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { BlockToolbar } from './BlockToolbar'
import { BlockRenderer } from './BlockRenderer'
import { RichTextEditor } from './RichTextEditor'
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

      <div className="bg-muted/30 rounded-xl border p-4 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-3">
          {blocks.map((block) => (
            <div
              key={block.id}
              onClick={() => setSelectedId(block.id)}
              className={cn(
                'group relative cursor-pointer rounded-lg border-2 transition-colors',
                selectedId === block.id
                  ? 'border-primary bg-background'
                  : 'bg-background/60 hover:border-primary/30 border-transparent',
              )}
            >
              <span
                className={cn(
                  'bg-primary text-primary-foreground absolute top-2 left-2 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase opacity-0 transition-opacity',
                  selectedId === block.id
                    ? 'opacity-100'
                    : 'group-hover:opacity-100',
                )}
              >
                {t(`blocks.${block.block_type}`, block.block_type)}
              </span>
              <BlockRenderer block={block} isPreview />
            </div>
          ))}
          {blocks.length === 0 && (
            <Card className="py-12 text-center">
              <p className="text-muted-foreground">{t('emptyBlocks')}</p>
            </Card>
          )}
        </div>
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
            <BlockEditor
              key={selectedBlock.id}
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

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-foreground block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      className="border-border bg-background text-foreground focus:ring-primary/40 w-full rounded-md border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function ListEditor<T>({
  items,
  onChange,
  renderItem,
  createItem,
  addLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  renderItem: (item: T, update: (next: T) => void) => React.ReactNode
  createItem: () => T
  addLabel: string
}) {
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="border-border relative space-y-2 rounded-md border p-2.5"
        >
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5"
            title="Pašalinti"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {renderItem(item, (next) =>
            onChange(items.map((it, i) => (i === idx ? next : it))),
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([...items, createItem()])}
      >
        <Plus className="mr-2 h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}

function BlockEditor({
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
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...content, ...patch })

  return (
    <div className="space-y-4">
      {block.block_type === 'hero' && (
        <>
          <Field label={t('heroTitle')}>
            <RichTextEditor
              multiline={false}
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label={t('heroSubtitle')}>
            <RichTextEditor
              multiline={false}
              value={(content.subtitle as string) ?? ''}
              onChange={(subtitle) => set({ subtitle })}
            />
          </Field>
          <Field label={t('alignment')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={(content.align as string) ?? 'center'}
              onChange={(e) => set({ align: e.target.value })}
            >
              <option value="left">{t('alignLeft')}</option>
              <option value="center">{t('alignCenter')}</option>
              <option value="right">{t('alignRight')}</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === 'text' && (
        <Field label={t('textContent')}>
          <RichTextEditor
            value={(content.text as string) ?? ''}
            onChange={(text) => set({ text })}
          />
        </Field>
      )}

      {block.block_type === 'video' && (
        <>
          <Field label={t('videoUrl')}>
            <TextInput
              value={(content.url as string) ?? ''}
              placeholder="https://youtube.com/watch?v=..."
              onChange={(url) => set({ url })}
            />
          </Field>
          <Field label={t('videoProvider')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={(content.provider as string) ?? 'youtube'}
              onChange={(e) => set({ provider: e.target.value })}
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="mp4">MP4</option>
            </select>
          </Field>
        </>
      )}

      {block.block_type === 'registration_form' && (
        <Field label={t('formButtonText')}>
          <TextInput
            value={(content.buttonText as string) ?? ''}
            onChange={(buttonText) => set({ buttonText })}
          />
        </Field>
      )}

      {block.block_type === 'countdown' && (
        <Field label={t('countdownTarget')}>
          <TextInput
            type="datetime-local"
            value={(content.target as string) ?? ''}
            onChange={(target) => set({ target })}
          />
        </Field>
      )}

      {block.block_type === 'benefits' && (
        <Field label={t('benefitsItems')}>
          <ListEditor
            items={(content.items as string[]) ?? []}
            onChange={(items) => set({ items })}
            createItem={() => 'New benefit'}
            addLabel={t('addItem')}
            renderItem={(item, update) => (
              <RichTextEditor
                multiline={false}
                value={item}
                onChange={update}
              />
            )}
          />
        </Field>
      )}

      {block.block_type === 'speaker' && (
        <>
          <Field label={t('speakerName')}>
            <TextInput
              value={(content.name as string) ?? ''}
              onChange={(name) => set({ name })}
            />
          </Field>
          <Field label={t('speakerBio')}>
            <RichTextEditor
              value={(content.bio as string) ?? ''}
              onChange={(bio) => set({ bio })}
            />
          </Field>
        </>
      )}

      {block.block_type === 'chat' && (
        <Field label={t('chatTitle')}>
          <RichTextEditor
            multiline={false}
            value={(content.title as string) ?? ''}
            onChange={(title) => set({ title })}
          />
        </Field>
      )}

      {block.block_type === 'cta' && (
        <>
          <Field label={t('ctaText')}>
            <RichTextEditor
              multiline={false}
              value={(content.text as string) ?? ''}
              onChange={(text) => set({ text })}
            />
          </Field>
          <Field label={t('ctaUrl')}>
            <TextInput
              value={(content.url as string) ?? ''}
              onChange={(url) => set({ url })}
            />
          </Field>
        </>
      )}

      {block.block_type === 'offer' && (
        <>
          <Field label={t('offerTitle')}>
            <RichTextEditor
              multiline={false}
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label={t('offerPrice')}>
            <TextInput
              value={(content.price as string) ?? ''}
              placeholder="$97"
              onChange={(price) => set({ price })}
            />
          </Field>
        </>
      )}

      {block.block_type === 'order_form' && (
        <Field label={t('formButtonText')}>
          <TextInput
            value={(content.buttonText as string) ?? ''}
            onChange={(buttonText) => set({ buttonText })}
          />
        </Field>
      )}

      {block.block_type === 'faq' && (
        <Field label={t('faqItems')}>
          <ListEditor
            items={
              (content.items as Array<{ question: string; answer: string }>) ??
              []
            }
            onChange={(items) => set({ items })}
            createItem={() => ({ question: 'Question?', answer: 'Answer.' })}
            addLabel={t('addItem')}
            renderItem={(item, update) => (
              <>
                <RichTextEditor
                  multiline={false}
                  value={item.question}
                  onChange={(question) => update({ ...item, question })}
                  placeholder={t('faqQuestion')}
                />
                <RichTextEditor
                  value={item.answer}
                  onChange={(answer) => update({ ...item, answer })}
                  placeholder={t('faqAnswer')}
                />
              </>
            )}
          />
        </Field>
      )}

      {saving && <p className="text-muted-foreground text-xs">{t('saving')}</p>}
    </div>
  )
}
