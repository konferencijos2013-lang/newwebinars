import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Layers3,
  Monitor,
  PanelLeft,
  PanelRight,
  Plus,
  Palette,
  Settings2,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
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
import {
  upsertBlock,
  deleteBlock,
  uploadFunnelImage,
  updateFunnelPage,
} from '@/features/funnels/api/funnels'
import type { FunnelBlock, FunnelPage } from '@/shared/database.types'
import {
  backgroundSettings,
  backgroundStyle,
} from '@/features/funnels/pageTheme'

type MobilePanel = 'blocks' | 'settings' | null
type PreviewDevice = 'desktop' | 'mobile'

export function FunnelEditor({
  page,
  accountId,
  initialBlocks,
  onChange,
}: {
  page: FunnelPage
  accountId: string
  initialBlocks: FunnelBlock[]
  onChange?: (blocks: FunnelBlock[]) => void
}) {
  const { t } = useTranslation('funnels')
  const [blocks, setBlocks] = useState<FunnelBlock[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [pageTheme, setPageTheme] = useState<Record<string, unknown>>(
    page.theme ?? {},
  )

  const selectedBlock = blocks.find((block) => block.id === selectedId)

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
        setMobilePanel('settings')
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
        const next = blocks.filter((block) => block.id !== id)
        setBlocks(next)
        if (selectedId === id) setSelectedId(null)
        onChange?.(next)
      } catch (err) {
        console.error('Failed to remove block', err)
      }
    },
    [blocks, onChange, selectedId],
  )

  const handleUpdateBlock = useCallback(
    async (
      id: string,
      patch: Pick<Partial<FunnelBlock>, 'content' | 'settings'>,
    ) => {
      setSaving(true)
      try {
        const block = blocks.find((item) => item.id === id)
        if (!block) return
        const saved = await upsertBlock({ ...block, ...patch })
        const next = blocks.map((item) => (item.id === id ? saved : item))
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

  const handleUpdatePageTheme = useCallback(
    async (theme: Record<string, unknown>) => {
      setSaving(true)
      try {
        await updateFunnelPage(page.id, { theme })
        setPageTheme(theme)
      } catch (err) {
        console.error('Failed to update page theme', err)
      } finally {
        setSaving(false)
      }
    },
    [page.id],
  )

  function selectBlock(id: string) {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 1023px)').matches)
      setMobilePanel('settings')
  }

  const pageSettingsContent = (
    <>
      <div className="mb-5 flex items-center gap-2">
        <Palette className="text-primary h-4 w-4" />
        <h2 className="text-sm font-semibold">{t('pageBackground')}</h2>
      </div>
      <BackgroundEditor
        accountId={accountId}
        value={pageTheme}
        onChange={handleUpdatePageTheme}
        saving={saving}
      />
    </>
  )

  const settingsContent = (
    <>
      <div className="mb-5 flex items-center gap-2">
        <Settings2 className="text-primary h-4 w-4" />
        <h2 className="text-sm font-semibold">{t('blockSettings')}</h2>
      </div>
      {selectedBlock ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm capitalize">
            {t(`blocks.${selectedBlock.block_type}`, selectedBlock.block_type)}
          </p>
          <BlockEditor
            key={selectedBlock.id}
            block={selectedBlock}
            onChange={(content) =>
              handleUpdateBlock(selectedBlock.id, { content })
            }
            onLayoutChange={(column_span) =>
              handleUpdateBlock(selectedBlock.id, {
                settings: {
                  ...(selectedBlock.settings as Record<string, unknown>),
                  column_span,
                },
              })
            }
            onSettingsChange={(settings) =>
              handleUpdateBlock(selectedBlock.id, { settings })
            }
            accountId={accountId}
            saving={saving}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 hover:text-red-700"
            onClick={() => handleRemove(selectedBlock.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('removeBlock')}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('selectBlock')}</p>
      )}
    </>
  )

  return (
    <div className="relative lg:h-[calc(100svh-14rem)] lg:min-h-[620px]">
      <div className="border-border bg-card mb-4 flex items-center justify-between rounded-xl border p-2 shadow-sm lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobilePanel('blocks')}
        >
          <PanelLeft className="h-4 w-4" /> {t('addBlock')}
        </Button>
        <PreviewSwitcher value={previewDevice} onChange={setPreviewDevice} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobilePanel('settings')}
        >
          <PanelRight className="h-4 w-4" />
          <span className="sr-only">{t('blockSettings')}</span>
        </Button>
      </div>

      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <aside className="border-border bg-card hidden min-h-0 overflow-y-auto rounded-xl border p-4 shadow-sm lg:block">
          <div className="mb-5 flex items-center gap-2">
            <Layers3 className="text-primary h-4 w-4" />
            <h2 className="text-sm font-semibold">{t('addBlock')}</h2>
          </div>
          <BlockToolbar onAdd={handleAdd} />
        </aside>

        <section className="border-border bg-muted/40 min-h-[540px] overflow-auto rounded-xl border p-3 sm:p-6 lg:min-h-0">
          <div className="mb-4 hidden justify-center lg:flex">
            <PreviewSwitcher
              value={previewDevice}
              onChange={setPreviewDevice}
            />
          </div>
          <div
            className={cn(
              'mx-auto min-h-full rounded-lg border shadow-sm transition-[max-width] duration-200',
              previewDevice === 'desktop' ? 'max-w-4xl' : 'max-w-[390px]',
            )}
            style={backgroundStyle(pageTheme)}
          >
            <div
              className={cn(
                'grid min-h-full gap-3 p-3 sm:p-5',
                previewDevice === 'desktop' ? 'grid-cols-6' : 'grid-cols-1',
              )}
            >
              {blocks.map((block) => {
                const settings = block.settings as Record<string, unknown>
                const columnSpan = (
                  [4, 6].includes(Number(settings?.column_span))
                    ? settings.column_span
                    : 12
                ) as 4 | 6 | 12
                const widthMode = String(settings?.width_mode ?? 'container')
                const fillsRow = widthMode !== 'container' || columnSpan === 12
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => selectBlock(block.id)}
                    className={cn(
                      'group focus-visible:ring-primary/40 relative block w-full rounded-lg border-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      previewDevice === 'desktop' &&
                        (fillsRow
                          ? 'col-span-6'
                          : columnSpan === 6
                            ? 'col-span-3'
                            : 'col-span-2'),
                      selectedId === block.id
                        ? 'border-primary bg-background'
                        : 'hover:border-primary/30 border-transparent',
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
                  </button>
                )
              })}
              {blocks.length === 0 && (
                <Card className="py-16 text-center">
                  <p className="text-muted-foreground">{t('emptyBlocks')}</p>
                  <Button
                    className="mt-4 lg:hidden"
                    variant="outline"
                    onClick={() => setMobilePanel('blocks')}
                  >
                    <Plus className="h-4 w-4" /> {t('addBlock')}
                  </Button>
                </Card>
              )}
            </div>
          </div>
        </section>

        <aside className="border-border bg-card hidden min-h-0 overflow-y-auto rounded-xl border p-4 shadow-sm lg:block">
          <div className="space-y-8">
            {pageSettingsContent}
            {settingsContent}
          </div>
        </aside>
      </div>

      {mobilePanel && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobilePanel(null)}
          />
          <aside className="bg-card absolute inset-y-0 right-0 flex w-full max-w-sm flex-col shadow-2xl">
            <div className="border-border flex items-center justify-between border-b p-4">
              <span className="text-sm font-semibold">
                {mobilePanel === 'blocks' ? t('addBlock') : t('blockSettings')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobilePanel(null)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              {mobilePanel === 'blocks' ? (
                <BlockToolbar onAdd={handleAdd} />
              ) : (
                <div className="space-y-8">
                  {pageSettingsContent}
                  {settingsContent}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function PreviewSwitcher({
  value,
  onChange,
}: {
  value: PreviewDevice
  onChange: (value: PreviewDevice) => void
}) {
  return (
    <div className="border-border bg-background inline-flex rounded-md border p-0.5">
      <Button
        variant={value === 'desktop' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2"
        aria-label="Desktop preview"
        onClick={() => onChange('desktop')}
      >
        <Monitor className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={value === 'mobile' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2"
        aria-label="Mobile preview"
        onClick={() => onChange('mobile')}
      >
        <Smartphone className="h-3.5 w-3.5" />
      </Button>
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
      onChange={(event) => onChange(event.target.value)}
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
      {items.map((item, index) => (
        <div
          key={index}
          className="border-border relative space-y-2 rounded-md border p-2.5"
        >
          <button
            type="button"
            onClick={() =>
              onChange(items.filter((_, itemIndex) => itemIndex !== index))
            }
            className="text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5"
            title="Pašalinti"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {renderItem(item, (next) =>
            onChange(
              items.map((current, itemIndex) =>
                itemIndex === index ? next : current,
              ),
            ),
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
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}

function BlockEditor({
  block,
  onChange,
  onLayoutChange,
  onSettingsChange,
  accountId,
  saving,
}: {
  block: FunnelBlock
  onChange: (content: Record<string, unknown>) => void
  onLayoutChange: (columnSpan: 4 | 6 | 12) => void
  onSettingsChange: (settings: Record<string, unknown>) => void
  accountId: string
  saving: boolean
}) {
  const { t } = useTranslation('funnels')
  const content = (block.content as Record<string, unknown>) || {}
  const columnSpan = (
    [4, 6].includes(
      Number((block.settings as Record<string, unknown>)?.column_span),
    )
      ? (block.settings as Record<string, unknown>).column_span
      : 12
  ) as 4 | 6 | 12
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...content, ...patch })

  return (
    <div className="space-y-4">
      <Field label={t('blockWidth')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={columnSpan}
          onChange={(event) =>
            onLayoutChange(Number(event.target.value) as 4 | 6 | 12)
          }
        >
          <option value={12}>{t('fullWidth')}</option>
          <option value={6}>{t('halfWidth')}</option>
          <option value={4}>{t('thirdWidth')}</option>
        </select>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('blockWidthHint')}
        </p>
      </Field>
      <Field label={t('sectionWidth')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={String(
            (block.settings as Record<string, unknown>)?.width_mode ??
              'container',
          )}
          onChange={(event) =>
            onSettingsChange({
              ...(block.settings as Record<string, unknown>),
              width_mode: event.target.value,
            })
          }
        >
          <option value="container">{t('widthContainer')}</option>
          <option value="page">{t('widthPage')}</option>
          <option value="viewport">{t('widthViewport')}</option>
        </select>
      </Field>
      <BackgroundEditor
        accountId={accountId}
        value={block.settings as Record<string, unknown>}
        onChange={onSettingsChange}
        saving={saving}
        compact
      />
      {block.block_type === 'webinar_hero' && (
        <>
          <Field label={t('heroEyebrow')}>
            <RichTextEditor
              multiline={false}
              value={(content.eyebrow as string) ?? ''}
              onChange={(eyebrow) => set({ eyebrow })}
            />
          </Field>
          <Field label={t('heroTitle')}>
            <RichTextEditor
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label={t('heroSubtitle')}>
            <RichTextEditor
              value={(content.subtitle as string) ?? ''}
              onChange={(subtitle) => set({ subtitle })}
            />
          </Field>
          <ImageBlockFields
            accountId={accountId}
            url={(content.imageUrl as string) ?? ''}
            alt={(content.imageAlt as string) ?? ''}
            onChange={(patch) =>
              set({ imageUrl: patch.url, imageAlt: patch.alt })
            }
          />
          <Field label={t('heroDateLabel')}>
            <TextInput
              value={(content.dateLabel as string) ?? ''}
              onChange={(dateLabel) => set({ dateLabel })}
              placeholder={t('heroDateHint')}
            />
          </Field>
          <Field label={t('heroBadge')}>
            <TextInput
              value={(content.badge as string) ?? ''}
              onChange={(badge) => set({ badge })}
            />
          </Field>
          <Field label={t('formButtonText')}>
            <TextInput
              value={(content.buttonText as string) ?? ''}
              onChange={(buttonText) => set({ buttonText })}
            />
          </Field>
        </>
      )}
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
              onChange={(event) => set({ align: event.target.value })}
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
      {block.block_type === 'image' && (
        <ImageBlockFields
          accountId={accountId}
          url={(content.url as string) ?? ''}
          alt={(content.alt as string) ?? ''}
          onChange={(patch) => set(patch)}
        />
      )}
      {block.block_type === 'video' && (
        <>
          <Field label={t('videoUrl')}>
            <TextInput
              value={(content.url as string) ?? ''}
              onChange={(url) => set({ url })}
              placeholder="https://..."
            />
          </Field>
          <Field label={t('videoProvider')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={(content.provider as string) ?? 'youtube'}
              onChange={(event) => set({ provider: event.target.value })}
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </>
      )}
      {block.block_type === 'registration_form' && (
        <>
          <Field label={t('formTitle')}>
            <RichTextEditor
              multiline={false}
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label={t('formButtonText')}>
            <TextInput
              value={(content.buttonText as string) ?? ''}
              onChange={(buttonText) => set({ buttonText })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={content.collectName !== false}
              onChange={(event) => set({ collectName: event.target.checked })}
            />
            {t('collectName')}
          </label>
          <Field label={t('successMessage')}>
            <TextInput
              value={(content.successMessage as string) ?? ''}
              onChange={(successMessage) => set({ successMessage })}
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
      {block.block_type === 'countdown' && (
        <>
          <Field label={t('countdownMode')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={(content.mode as string) ?? 'fixed'}
              onChange={(event) => set({ mode: event.target.value })}
            >
              <option value="fixed">{t('countdownModeFixed')}</option>
              <option value="visitor">{t('countdownModeVisitor')}</option>
            </select>
          </Field>
          {(content.mode as string) === 'visitor' ? (
            <Field label={t('countdownDuration')}>
              <TextInput
                type="number"
                value={String(content.duration_minutes ?? 10)}
                onChange={(value) =>
                  set({ duration_minutes: Math.max(1, Number(value) || 1) })
                }
              />
              <p className="text-muted-foreground text-xs">
                {t('countdownVisitorHint')}
              </p>
            </Field>
          ) : (
            <Field label={t('countdownTarget')}>
              <TextInput
                type="datetime-local"
                value={(content.target as string) ?? ''}
                onChange={(target) => set({ target })}
              />
            </Field>
          )}
        </>
      )}
      {block.block_type === 'benefits' && (
        <Field label={t('benefitsItems')}>
          <ListEditor
            items={(content.items as string[]) ?? []}
            onChange={(items) => set({ items })}
            renderItem={(item, update) => (
              <RichTextEditor
                multiline={false}
                value={item}
                onChange={update}
              />
            )}
            createItem={() => ''}
            addLabel={t('addItem')}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                (block.settings as Record<string, unknown>)?.sticky_mobile ===
                true
              }
              onChange={(event) =>
                onSettingsChange({
                  ...(block.settings as Record<string, unknown>),
                  sticky_mobile: event.target.checked,
                })
              }
            />
            {t('stickyMobile')}
          </label>
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
              onChange={(price) => set({ price })}
            />
          </Field>
        </>
      )}
      {block.block_type === 'faq' && (
        <Field label={t('faqItems')}>
          <ListEditor
            items={
              (content.items as Array<{ question: string; answer: string }>) ??
              []
            }
            onChange={(items) => set({ items })}
            renderItem={(item, update) => (
              <>
                <Field label={t('faqQuestion')}>
                  <RichTextEditor
                    multiline={false}
                    value={item.question}
                    onChange={(question) => update({ ...item, question })}
                  />
                </Field>
                <Field label={t('faqAnswer')}>
                  <RichTextEditor
                    value={item.answer}
                    onChange={(answer) => update({ ...item, answer })}
                  />
                </Field>
              </>
            )}
            createItem={() => ({ question: '', answer: '' })}
            addLabel={t('addItem')}
          />
        </Field>
      )}
      {saving && <p className="text-muted-foreground text-xs">{t('saving')}</p>}
    </div>
  )
}

function ImageBlockFields({
  accountId,
  url,
  alt,
  onChange,
}: {
  accountId: string
  url: string
  alt: string
  onChange: (patch: Record<string, unknown>) => void
}) {
  const { t } = useTranslation('funnels')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file?: File) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      onChange({ url: await uploadFunnelImage(accountId, file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Field label={t('imageUpload')}>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          disabled={uploading}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <p className="text-muted-foreground text-xs">
          {uploading ? t('imageUploading') : t('imageUploadHint')}
        </p>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </Field>
      <Field label={t('imageUrl')}>
        <TextInput
          value={url}
          placeholder="https://..."
          onChange={(nextUrl) => onChange({ url: nextUrl })}
        />
      </Field>
      <Field label={t('imageAlt')}>
        <TextInput
          value={alt}
          onChange={(nextAlt) => onChange({ alt: nextAlt })}
        />
      </Field>
    </>
  )
}

function BackgroundEditor({
  accountId,
  value,
  onChange,
  saving,
  compact = false,
}: {
  accountId: string
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  saving: boolean
  compact?: boolean
}) {
  const { t } = useTranslation('funnels')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settings = backgroundSettings(value)
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...value, ...patch })

  async function upload(file?: File) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      set({
        background_image: await uploadFunnelImage(accountId, file),
        background_type: 'image',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {compact && <p className="text-sm font-medium">{t('blockBackground')}</p>}
      <Field label={t('backgroundType')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={String(settings.background_type)}
          onChange={(event) => set({ background_type: event.target.value })}
        >
          <option value="none">{t('backgroundNone')}</option>
          <option value="color">{t('backgroundColor')}</option>
          <option value="gradient">{t('backgroundGradient')}</option>
          <option value="image">{t('backgroundImage')}</option>
        </select>
      </Field>
      {settings.background_type === 'color' && (
        <Field label={t('backgroundColor')}>
          <input
            className="border-border bg-background h-9 w-full rounded-md border p-1"
            type="color"
            value={String(settings.background_color)}
            onChange={(event) => set({ background_color: event.target.value })}
          />
        </Field>
      )}
      {settings.background_type === 'gradient' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('gradientFrom')}>
              <input
                className="border-border bg-background h-9 w-full rounded-md border p-1"
                type="color"
                value={String(settings.gradient_from)}
                onChange={(event) => set({ gradient_from: event.target.value })}
              />
            </Field>
            <Field label={t('gradientTo')}>
              <input
                className="border-border bg-background h-9 w-full rounded-md border p-1"
                type="color"
                value={String(settings.gradient_to)}
                onChange={(event) => set({ gradient_to: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t('gradientDirection')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={String(settings.gradient_direction)}
              onChange={(event) =>
                set({ gradient_direction: event.target.value })
              }
            >
              <option value="135deg">↘</option>
              <option value="90deg">→</option>
              <option value="180deg">↓</option>
            </select>
          </Field>
        </>
      )}
      {settings.background_type === 'image' && (
        <>
          <Field label={t('backgroundUpload')}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              disabled={uploading}
              onChange={(event) => upload(event.target.files?.[0])}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {uploading ? t('imageUploading') : t('imageUploadHint')}
            </p>
          </Field>
          <Field label={t('backgroundImageUrl')}>
            <TextInput
              value={String(settings.background_image)}
              placeholder="https://..."
              onChange={(background_image) => set({ background_image })}
            />
          </Field>
          <Field label={t('backgroundOverlay')}>
            <input
              className="w-full"
              type="range"
              min="0"
              max="80"
              value={Number(settings.background_overlay)}
              onChange={(event) =>
                set({ background_overlay: Number(event.target.value) })
              }
            />
            <p className="text-muted-foreground text-xs">
              {Number(settings.background_overlay)}%
            </p>
          </Field>
        </>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      {saving && <p className="text-muted-foreground text-xs">{t('saving')}</p>}
    </div>
  )
}
