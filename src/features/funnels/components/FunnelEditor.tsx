import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
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
  getFunnelTemplates,
  localizeFunnelTemplate,
  type FunnelTemplateId,
} from '@/features/funnels/templates'
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
  pageContentSettings,
  pageContentStyle,
} from '@/features/funnels/pageTheme'

type MobilePanel = 'blocks' | 'settings' | null
type PreviewDevice = 'desktop' | 'mobile'

export function FunnelEditor({
  page,
  accountId,
  initialBlocks,
  onChange,
  onApplyTemplate,
}: {
  page: FunnelPage
  accountId: string
  initialBlocks: FunnelBlock[]
  onChange?: (blocks: FunnelBlock[]) => void
  onApplyTemplate?: (
    templateId: FunnelTemplateId,
  ) => Promise<{ page: FunnelPage; blocks: FunnelBlock[] }>
}) {
  const { t, i18n } = useTranslation('funnels')
  const [blocks, setBlocks] = useState<FunnelBlock[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(
    null,
  )
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop')
  const [templatesOpen, setTemplatesOpen] = useState(() => {
    try {
      return (
        window.localStorage.getItem('newwebinars:page-templates-open') !== '0'
      )
    } catch {
      return true
    }
  })
  const [dragId, setDragId] = useState<string | null>(null)
  const [pageTheme, setPageTheme] = useState<Record<string, unknown>>(
    page.theme ?? {},
  )

  const selectedBlock = blocks.find((block) => block.id === selectedId)

  const templates =
    page.step_type === 'registration' ||
    page.step_type === 'waiting_room' ||
    page.step_type === 'offer'
      ? getFunnelTemplates(page.step_type).map((template) =>
          localizeFunnelTemplate(template, i18n.resolvedLanguage),
        )
      : []

  async function handleApplyTemplate(templateId: FunnelTemplateId) {
    if (!onApplyTemplate) return
    if (
      blocks.length > 0 &&
      !window.confirm(
        t('templateReplaceConfirm', {
          defaultValue:
            'Applying this template will replace all blocks on this page. Continue?',
        }),
      )
    )
      return

    setApplyingTemplateId(templateId)
    setTemplateError(null)
    setSelectedId(null)
    try {
      const result = await onApplyTemplate(templateId)
      setBlocks(result.blocks)
      setPageTheme(result.page.theme ?? {})
      onChange?.(result.blocks)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplyingTemplateId(null)
    }
  }

  const handleAdd = useCallback(
    async (type: FunnelBlockType) => {
      const def = FUNNEL_BLOCK_REGISTRY[type]
      const newBlock: Partial<FunnelBlock> & {
        page_id: string
        block_type: string
      } = {
        page_id: page.id,
        block_type: type,
        sort_order:
          blocks.reduce((max, block) => Math.max(max, block.sort_order), -1) +
          1,
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

  const persistOrder = useCallback(
    async (reordered: FunnelBlock[]) => {
      if (saving) return
      const previous = blocks
      const normalized = reordered.map((block, index) => ({
        ...block,
        sort_order: index,
      }))
      setSaving(true)
      setBlocks(normalized)
      onChange?.(normalized)
      try {
        const saved = await Promise.all(
          normalized.map((block) => upsertBlock(block)),
        )
        setBlocks(saved)
        onChange?.(saved)
      } catch (err) {
        setBlocks(previous)
        onChange?.(previous)
        console.error('Failed to move block', err)
      } finally {
        setSaving(false)
      }
    },
    [blocks, onChange, saving],
  )

  const handleMoveBlock = useCallback(
    async (id: string, direction: -1 | 1) => {
      const currentIndex = blocks.findIndex((block) => block.id === id)
      const targetIndex = currentIndex + direction
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= blocks.length)
        return
      const reordered = [...blocks]
      ;[reordered[currentIndex], reordered[targetIndex]] = [
        reordered[targetIndex],
        reordered[currentIndex],
      ]
      await persistOrder(reordered)
    },
    [blocks, persistOrder],
  )

  const handleDropBlock = useCallback(
    async (targetId: string) => {
      if (!dragId || dragId === targetId) return
      const from = blocks.findIndex((block) => block.id === dragId)
      const to = blocks.findIndex((block) => block.id === targetId)
      if (from < 0 || to < 0) return
      const reordered = [...blocks]
      const [moved] = reordered.splice(from, 1)
      reordered.splice(to, 0, moved)
      setDragId(null)
      await persistOrder(reordered)
    },
    [blocks, dragId, persistOrder],
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
      <PageContentEditor
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
            blocks={blocks}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={
                saving ||
                blocks.findIndex((block) => block.id === selectedBlock.id) === 0
              }
              onClick={() => void handleMoveBlock(selectedBlock.id, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              {t('moveBlockUp')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                saving ||
                blocks.findIndex((block) => block.id === selectedBlock.id) ===
                  blocks.length - 1
              }
              onClick={() => void handleMoveBlock(selectedBlock.id, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {t('moveBlockDown')}
            </Button>
          </div>
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
    <div className="relative space-y-4">
      {templates.length > 0 && (
        <section aria-labelledby="funnel-templates-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="funnel-templates-title" className="text-sm font-semibold">
                {t('pageTemplates', { defaultValue: 'Page templates' })}
              </h2>
              {templatesOpen && (
                <p className="text-muted-foreground text-xs">
                  {t('pageTemplatesHint', {
                    defaultValue:
                      'Choose a design to replace this page’s theme and blocks.',
                  })}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={templatesOpen}
              aria-controls="funnel-templates-panel"
              onClick={() => {
                const next = !templatesOpen
                setTemplatesOpen(next)
                try {
                  window.localStorage.setItem(
                    'newwebinars:page-templates-open',
                    next ? '1' : '0',
                  )
                } catch {
                  /* preference is optional */
                }
              }}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  templatesOpen ? '' : '-rotate-90',
                )}
              />
              {templatesOpen
                ? t('templatesCollapse', { defaultValue: 'Collapse' })
                : t('templatesExpand', { defaultValue: 'Expand' })}
            </Button>
          </div>
          {templatesOpen && (
            <div
              id="funnel-templates-panel"
              className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {templates.map((template, index) => (
                <button
                  key={template.id}
                  type="button"
                  className="border-border bg-card hover:border-primary/50 overflow-hidden rounded-xl border text-left transition-colors disabled:opacity-50"
                  disabled={!onApplyTemplate || applyingTemplateId !== null}
                  onClick={() =>
                    void handleApplyTemplate(template.id as FunnelTemplateId)
                  }
                >
                  <span
                    className="block h-24 p-3"
                    style={backgroundStyle(template.theme)}
                  >
                    <span className="mx-auto block h-full max-w-[85%] rounded-md border border-black/10 bg-white/80 p-2 shadow-sm">
                      {template.blocks.some(
                        (block) =>
                          block.block_type === 'webinar_hero' &&
                          block.content.showImage === true,
                      ) && (
                        <span className="mb-2 block h-7 rounded-md bg-slate-300/80" />
                      )}
                      <span className="mb-2 block h-2 w-2/3 rounded bg-slate-800/70" />
                      <span className="mb-1 block h-1.5 w-full rounded bg-slate-400/50" />
                      <span className="mb-3 block h-1.5 w-4/5 rounded bg-slate-400/50" />
                      <span
                        className="block h-3 w-1/2 rounded"
                        style={{
                          backgroundColor:
                            typeof template.blocks.find(
                              (item) => item.block_type === 'webinar_hero',
                            )?.content.buttonColor === 'string'
                              ? String(
                                  template.blocks.find(
                                    (item) =>
                                      item.block_type === 'webinar_hero',
                                  )?.content.buttonColor,
                                )
                              : index % 2
                                ? '#6366f1'
                                : '#10b981',
                        }}
                      />
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="block text-sm font-semibold">
                      {template.name}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {template.description}
                    </span>
                    {applyingTemplateId === template.id && (
                      <span className="text-primary mt-2 block text-xs">
                        {t('applyingTemplate', { defaultValue: 'Applying…' })}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          {templateError && (
            <p className="text-destructive mt-2 text-sm">{templateError}</p>
          )}
        </section>
      )}
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
                'min-h-full rounded-lg border p-3 shadow-sm sm:p-5',
                previewDevice === 'desktop'
                  ? 'w-full'
                  : 'mx-auto max-w-[390px]',
              )}
              style={backgroundStyle(pageTheme)}
            >
              <div
                className="mx-auto min-h-full transition-[max-width] duration-200"
                style={
                  previewDevice === 'desktop'
                    ? pageContentStyle(pageTheme)
                    : { ...pageContentStyle(pageTheme), maxWidth: '390px' }
                }
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
                    const widthMode =
                      block.block_type === 'webinar_hero'
                        ? 'container'
                        : String(settings?.width_mode ?? 'container')
                    const fillsRow =
                      widthMode !== 'container' || columnSpan === 12
                    const blockIndex = blocks.findIndex(
                      (item) => item.id === block.id,
                    )
                    return (
                      <div
                        key={block.id}
                        role="button"
                        tabIndex={0}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          void handleDropBlock(block.id)
                        }}
                        onClick={() => selectBlock(block.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            selectBlock(block.id)
                          }
                        }}
                        className={cn(
                          'group focus-visible:ring-primary/40 relative block w-full cursor-pointer rounded-lg border-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
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
                        <div
                          className={cn(
                            'absolute top-2 right-2 z-20 flex gap-1 opacity-0 transition-opacity',
                            selectedId === block.id
                              ? 'opacity-100'
                              : 'group-focus-within:opacity-100 group-hover:opacity-100',
                          )}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 cursor-grab p-0 shadow-sm active:cursor-grabbing"
                            draggable
                            aria-label={t('moveBlock', 'Perkelti bloką')}
                            title={t('moveBlock', 'Perkelti bloką')}
                            onDragStart={(event) => {
                              event.stopPropagation()
                              setDragId(block.id)
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', block.id)
                            }}
                            onDragEnd={() => setDragId(null)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <GripVertical className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 shadow-sm"
                            disabled={saving || blockIndex === 0}
                            aria-label={t('moveBlockUp')}
                            title={t('moveBlockUp')}
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleMoveBlock(block.id, -1)
                            }}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 shadow-sm"
                            disabled={
                              saving || blockIndex === blocks.length - 1
                            }
                            aria-label={t('moveBlockDown')}
                            title={t('moveBlockDown')}
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleMoveBlock(block.id, 1)
                            }}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <BlockRenderer
                          block={block}
                          isPreview
                          availableBlockIds={blocks.map((item) => item.id)}
                          onActivateImage={() => selectBlock(block.id)}
                          onReplaceImage={
                            block.block_type === 'webinar_hero' ||
                            block.block_type === 'image' ||
                            block.block_type === 'speaker'
                              ? async (file) => {
                                  selectBlock(block.id)
                                  const url = await uploadFunnelImage(
                                    accountId,
                                    file,
                                  )
                                  const content = {
                                    ...(block.content as Record<
                                      string,
                                      unknown
                                    >),
                                  }
                                  if (block.block_type === 'image') {
                                    content.url = url
                                  } else {
                                    content.imageUrl = url
                                    if (block.block_type === 'webinar_hero') {
                                      content.showImage = true
                                    }
                                  }
                                  await handleUpdateBlock(block.id, { content })
                                }
                              : undefined
                          }
                        />
                      </div>
                    )
                  })}
                  {blocks.length === 0 && (
                    <Card className="py-16 text-center">
                      <p className="text-muted-foreground">
                        {t('emptyBlocks')}
                      </p>
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
            </div>
          </section>

          <aside className="border-border bg-card hidden min-h-0 overflow-y-auto rounded-xl border p-4 shadow-sm lg:block">
            <div className="space-y-8">
              {selectedBlock ? settingsContent : null}
              {pageSettingsContent}
              {selectedBlock ? null : settingsContent}
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
                  {mobilePanel === 'blocks'
                    ? t('addBlock')
                    : t('blockSettings')}
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
                    {selectedBlock ? settingsContent : null}
                    {pageSettingsContent}
                    {selectedBlock ? null : settingsContent}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
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
  blocks,
}: {
  block: FunnelBlock
  onChange: (content: Record<string, unknown>) => void
  onLayoutChange: (columnSpan: 4 | 6 | 12) => void
  onSettingsChange: (settings: Record<string, unknown>) => void
  accountId: string
  saving: boolean
  blocks: FunnelBlock[]
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
      {block.block_type === 'webinar_hero' && (
        <ImageBlockFields
          accountId={accountId}
          url={(content.imageUrl as string) ?? ''}
          alt={(content.imageAlt as string) ?? ''}
          widthDesktop={Number(content.imageWidthDesktop ?? 100)}
          widthMobile={Number(content.imageWidthMobile ?? 100)}
          onChange={(patch) => {
            const heroPatch: Record<string, unknown> = {}
            if ('url' in patch) heroPatch.imageUrl = patch.url
            if ('alt' in patch) heroPatch.imageAlt = patch.alt
            if ('widthDesktop' in patch)
              heroPatch.imageWidthDesktop = patch.widthDesktop
            if ('widthMobile' in patch)
              heroPatch.imageWidthMobile = patch.widthMobile
            if (patch.url) heroPatch.showImage = true
            set(heroPatch)
          }}
        />
      )}
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
      {block.block_type !== 'webinar_hero' && (
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
      )}
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
          <Field label={t('buttonColor')}>
            <input
              type="color"
              className="border-border bg-background h-9 w-full rounded-md border px-1"
              value={
                /^#[0-9a-fA-F]{6}$/.test(String(content.buttonColor ?? ''))
                  ? String(content.buttonColor)
                  : '#78a653'
              }
              onChange={(event) => set({ buttonColor: event.target.value })}
            />
          </Field>
          <Field label={t('heroButtonAction')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={String(content.buttonAction ?? 'registration')}
              onChange={(event) => set({ buttonAction: event.target.value })}
            >
              <option value="registration">
                {t('heroButtonRegistration')}
              </option>
              <option value="block">{t('heroButtonBlock')}</option>
              <option value="url">{t('heroButtonExternalUrl')}</option>
            </select>
          </Field>
          {content.buttonAction === 'block' && (
            <Field label={t('heroButtonTargetBlock')}>
              <select
                className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
                value={String(content.buttonTargetBlockId ?? '')}
                onChange={(event) =>
                  set({ buttonTargetBlockId: event.target.value })
                }
              >
                <option value="">{t('heroButtonSelectBlock')}</option>
                {blocks
                  .filter((item) => item.id !== block.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {t(`blocks.${item.block_type}`, item.block_type)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {content.buttonAction === 'url' && (
            <Field label={t('heroButtonUrl')}>
              <TextInput
                value={String(content.buttonUrl ?? '')}
                placeholder="https://..."
                onChange={(buttonUrl) => set({ buttonUrl })}
              />
            </Field>
          )}
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
          widthDesktop={Number(content.widthDesktop ?? 100)}
          widthMobile={Number(content.widthMobile ?? 100)}
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
          <Field label={t('registrationMethod')}>
            <select
              className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={(content.registrationMethod as string) ?? 'inherit'}
              onChange={(event) =>
                set({ registrationMethod: event.target.value })
              }
            >
              <option value="inherit">{t('registrationMethodInherit')}</option>
              <option value="email">{t('registrationMethodEmail')}</option>
              <option value="telegram">
                {t('registrationMethodTelegram')}
              </option>
              <option value="both">{t('registrationMethodBoth')}</option>
            </select>
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
        <>
          <Field label={t('benefitsTitle')}>
            <RichTextEditor
              multiline={false}
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
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
        </>
      )}
      {block.block_type === 'speaker' && (
        <>
          <ImageBlockFields
            accountId={accountId}
            url={(content.imageUrl as string) ?? ''}
            alt={(content.imageAlt as string) ?? ''}
            widthDesktop={100}
            widthMobile={100}
            onChange={(patch) => {
              const speakerPatch: Record<string, unknown> = {}
              if ('url' in patch) speakerPatch.imageUrl = patch.url
              if ('alt' in patch) speakerPatch.imageAlt = patch.alt
              set(speakerPatch)
            }}
          />
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
          <Field label={t('ctaHeading')}>
            <RichTextEditor
              multiline={false}
              value={(content.title as string) ?? ''}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label={t('ctaNote')}>
            <RichTextEditor
              value={(content.subtitle as string) ?? ''}
              onChange={(subtitle) => set({ subtitle })}
            />
          </Field>
          <Field label={t('ctaText')}>
            <RichTextEditor
              multiline={false}
              value={(content.text as string) ?? ''}
              onChange={(text) => set({ text })}
            />
          </Field>
          <Field label={t('buttonColor')}>
            <input
              type="color"
              className="border-border bg-background h-9 w-full rounded-md border px-1"
              value={
                /^#[0-9a-fA-F]{6}$/.test(String(content.buttonColor ?? ''))
                  ? String(content.buttonColor)
                  : '#4f46e5'
              }
              onChange={(event) => set({ buttonColor: event.target.value })}
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
        <OfferBlockEditor content={content} onChange={set} />
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

type OfferTier = {
  name: string
  description: string
  price: string
  currency: string
  oldPrice: string
  period: string
  features: string[]
  badge: string
  featured: boolean
  buttonText: string
  buttonUrl: string
}

const DEFAULT_OFFER_TIERS: OfferTier[] = ['Basic', 'Standard', 'Pro'].map(
  (name) => ({
    name,
    description: '',
    price: '',
    currency: 'EUR',
    oldPrice: '',
    period: '',
    features: [],
    badge: '',
    featured: name === 'Standard',
    buttonText: '',
    buttonUrl: '',
  }),
)

function normalizeOfferTier(
  value: Partial<OfferTier>,
  index: number,
): OfferTier {
  return {
    ...DEFAULT_OFFER_TIERS[index],
    ...value,
    features: Array.isArray(value.features) ? value.features : [],
    featured: value.featured === true,
    period: typeof value.period === 'string' ? value.period : '',
  }
}

function OfferBlockEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const { t } = useTranslation('funnels')
  const isTiered =
    content.mode === 'tiers' ||
    content.variant === 'tiers' ||
    Array.isArray(content.tiers)
  const tiers = DEFAULT_OFFER_TIERS.map((fallback, index) =>
    normalizeOfferTier(
      ((content.tiers as Array<Partial<OfferTier>> | undefined)?.[index] ??
        fallback) as Partial<OfferTier>,
      index,
    ),
  )
  const updateTier = (index: number, patch: Partial<OfferTier>) => {
    const next = tiers.map((tier, tierIndex) => ({
      ...tier,
      ...(tierIndex === index ? patch : {}),
      ...(patch.featured === true && tierIndex !== index
        ? { featured: false }
        : {}),
    }))
    onChange({ tiers: next })
  }

  return (
    <>
      <Field label={t('offerTitle')}>
        <RichTextEditor
          multiline={false}
          value={(content.title as string) ?? ''}
          onChange={(title) => onChange({ title })}
        />
      </Field>
      {!isTiered ? (
        <Field label={t('offerPrice')}>
          <TextInput
            value={(content.price as string) ?? ''}
            onChange={(price) => onChange({ price })}
          />
        </Field>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('offerTiers')}</p>
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="border-border space-y-3 rounded-lg border p-3"
            >
              <p className="text-sm font-semibold">
                {t(
                  `offerTier${index === 0 ? 'Basic' : index === 1 ? 'Standard' : 'Pro'}`,
                )}
              </p>
              <Field label={t('offerTierName')}>
                <RichTextEditor
                  multiline={false}
                  value={tier.name}
                  onChange={(name) => updateTier(index, { name })}
                />
              </Field>
              <Field label={t('offerTierDescription')}>
                <RichTextEditor
                  value={tier.description}
                  onChange={(description) => updateTier(index, { description })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('offerPrice')}>
                  <TextInput
                    value={tier.price}
                    onChange={(price) => updateTier(index, { price })}
                  />
                </Field>
                <Field label={t('offerTierCurrency')}>
                  <TextInput
                    value={tier.currency}
                    onChange={(currency) => updateTier(index, { currency })}
                  />
                </Field>
              </div>
              <Field label={t('offerTierOldPrice')}>
                <TextInput
                  value={tier.oldPrice}
                  onChange={(oldPrice) => updateTier(index, { oldPrice })}
                />
              </Field>
              <Field label={t('offerTierPeriod')}>
                <TextInput
                  value={tier.period}
                  placeholder={t('offerTierPeriodPlaceholder')}
                  onChange={(period) => updateTier(index, { period })}
                />
              </Field>
              <Field label={t('offerTierFeatures')}>
                <ListEditor
                  items={tier.features}
                  onChange={(features) => updateTier(index, { features })}
                  renderItem={(feature, update) => (
                    <RichTextEditor
                      multiline={false}
                      value={feature}
                      onChange={update}
                    />
                  )}
                  createItem={() => ''}
                  addLabel={t('addItem')}
                />
              </Field>
              <Field label={t('offerTierBadge')}>
                <TextInput
                  value={tier.badge}
                  onChange={(badge) => updateTier(index, { badge })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tier.featured}
                  onChange={(event) =>
                    updateTier(index, { featured: event.target.checked })
                  }
                />
                {t('offerTierFeatured')}
              </label>
              <Field label={t('offerTierButtonText')}>
                <TextInput
                  value={tier.buttonText}
                  onChange={(buttonText) => updateTier(index, { buttonText })}
                />
              </Field>
              <Field label={t('offerTierButtonUrl')}>
                <TextInput
                  value={tier.buttonUrl}
                  placeholder="https://..."
                  onChange={(buttonUrl) => updateTier(index, { buttonUrl })}
                />
              </Field>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ImageBlockFields({
  accountId,
  url,
  alt,
  widthDesktop,
  widthMobile,
  onChange,
}: {
  accountId: string
  url: string
  alt: string
  widthDesktop: number
  widthMobile: number
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
      <Field label={t('imageDesktopWidth')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={widthDesktop}
          onChange={(event) =>
            onChange({ widthDesktop: Number(event.target.value) })
          }
        >
          {[25, 50, 75, 100].map((width) => (
            <option key={width} value={width}>
              {width}%
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('imageMobileWidth')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={widthMobile}
          onChange={(event) =>
            onChange({ widthMobile: Number(event.target.value) })
          }
        >
          {[25, 50, 75, 100].map((width) => (
            <option key={width} value={width}>
              {width}%
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('imageResponsiveHint')}
        </p>
      </Field>
    </>
  )
}

function PageContentEditor({
  value,
  onChange,
  saving,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  saving: boolean
}) {
  const { t } = useTranslation('funnels')
  const settings = pageContentSettings(value)
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...value, ...patch })

  return (
    <div className="border-border mt-6 space-y-4 border-t pt-5">
      <p className="text-sm font-medium">{t('contentPanel')}</p>
      <Field label={`${t('pageContentWidth')}: ${settings.content_width}px`}>
        <input
          className="w-full"
          type="range"
          min="600"
          max="800"
          step="20"
          value={settings.content_width}
          onChange={(event) =>
            set({ content_width: Number(event.target.value) })
          }
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.content_panel_enabled}
          onChange={(event) =>
            set({ content_panel_enabled: event.target.checked })
          }
        />
        {t('highlightContentPanel')}
      </label>
      {settings.content_panel_enabled && (
        <Field label={t('contentBackgroundColor')}>
          <input
            className="border-border bg-background h-9 w-full rounded-md border p-1"
            type="color"
            value={String(settings.content_background_color)}
            onChange={(event) =>
              set({ content_background_color: event.target.value })
            }
          />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.content_border_enabled}
          onChange={(event) =>
            set({ content_border_enabled: event.target.checked })
          }
        />
        {t('showContentBorder')}
      </label>
      {settings.content_border_enabled && (
        <>
          <Field label={t('contentBorderColor')}>
            <input
              className="border-border bg-background h-9 w-full rounded-md border p-1"
              type="color"
              value={String(settings.content_border_color)}
              onChange={(event) =>
                set({ content_border_color: event.target.value })
              }
            />
          </Field>
          <Field
            label={`${t('contentBorderWidth')}: ${settings.content_border_width}px`}
          >
            <input
              className="w-full"
              type="range"
              min="1"
              max="4"
              value={settings.content_border_width}
              onChange={(event) =>
                set({ content_border_width: Number(event.target.value) })
              }
            />
          </Field>
        </>
      )}
      <Field label={t('contentShadow')}>
        <select
          className="border-border bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
          value={settings.content_shadow}
          onChange={(event) => set({ content_shadow: event.target.value })}
        >
          <option value="none">{t('shadowNone')}</option>
          <option value="small">{t('shadowSmall')}</option>
          <option value="medium">{t('shadowMedium')}</option>
          <option value="large">{t('shadowLarge')}</option>
        </select>
      </Field>
      <Field
        label={`${t('contentCornerRadius')}: ${settings.content_border_radius}px`}
      >
        <input
          className="w-full"
          type="range"
          min="0"
          max="40"
          step="2"
          value={settings.content_border_radius}
          onChange={(event) =>
            set({ content_border_radius: Number(event.target.value) })
          }
        />
      </Field>
      {saving && <p className="text-muted-foreground text-xs">{t('saving')}</p>}
    </div>
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
