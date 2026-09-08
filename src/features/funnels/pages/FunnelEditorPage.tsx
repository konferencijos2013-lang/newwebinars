import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  PenLine,
  Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { FunnelEditor } from '@/features/funnels/components/FunnelEditor'
import { AiAssistant } from '@/features/ai/components/AiAssistant'
import {
  fetchFunnel,
  fetchFunnelPages,
  fetchFunnelBlocks,
  updateFunnel,
  replaceFunnelPageTemplate,
} from '@/features/funnels/api/funnels'
import { fetchWebinars } from '@/features/webinars/api/webinars'
import {
  getFunnelTemplate,
  localizeFunnelTemplate,
  type FunnelTemplateId,
} from '@/features/funnels/templates'
import type {
  Funnel,
  FunnelPage,
  FunnelBlock,
  Webinar,
} from '@/shared/database.types'

export function FunnelEditorPage() {
  const { t, i18n } = useTranslation('funnels')
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [pages, setPages] = useState<FunnelPage[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<FunnelBlock[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [linkedWebinarId, setLinkedWebinarId] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let isActive = true

    Promise.all([fetchFunnel(id), fetchFunnelPages(id)])
      .then(([f, p]) => {
        if (!isActive) return
        setFunnel(f)
        setLinkedWebinarId(f.webinar_id ?? '')
        setPages(p)
        void fetchWebinars(f.account_id)
          .then((items) => {
            if (isActive) setWebinars(items)
          })
          .catch(() => {})
        const defaultPage = p.find((page) => page.is_default) ?? p[0]
        setActivePageId(defaultPage?.id ?? null)

        if (defaultPage) {
          fetchFunnelBlocks(defaultPage.id)
            .then((b) => {
              if (!isActive) return
              setBlocks(b)
              setStatus('ready')
            })
            .catch((err) => {
              if (!isActive) return
              setError(err instanceof Error ? err.message : String(err))
              setStatus('error')
            })
        } else {
          setStatus('ready')
        }
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      isActive = false
    }
  }, [id])

  async function handlePublish() {
    if (!funnel) return
    try {
      const updated = await updateFunnel(funnel.id, { status: 'published' })
      setFunnel(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSaveSettings() {
    if (!funnel) return
    setIsSavingSettings(true)
    setSettingsMessage(null)
    try {
      const updated = await updateFunnel(funnel.id, {
        webinar_id: linkedWebinarId || null,
      })
      setFunnel(updated)
      setSettingsMessage(t('settingsSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleApplyTemplate(templateId: FunnelTemplateId) {
    if (!activePage) throw new Error(t('errorNotFound'))
    const template = getFunnelTemplate(templateId)
    if (!template || template.step !== activePage.step_type) {
      throw new Error(
        t('templateInvalidForPage', {
          defaultValue: 'This template cannot be applied to the current page.',
        }),
      )
    }
    const localized = localizeFunnelTemplate(template, i18n.resolvedLanguage)
    const updatedPage = await replaceFunnelPageTemplate(activePage.id, {
      theme: localized.theme,
      blocks: localized.blocks,
    })
    const updatedBlocks = await fetchFunnelBlocks(activePage.id)
    setPages((current) =>
      current.map((page) => (page.id === updatedPage.id ? updatedPage : page)),
    )
    setBlocks(updatedBlocks)
    return { page: updatedPage, blocks: updatedBlocks }
  }

  async function copyPublicLink() {
    if (!funnel || !activePage) return
    await navigator.clipboard.writeText(
      `${window.location.origin}/f/${funnel.slug}/${activePage.path}`,
    )
    setSettingsMessage(t('publicLinkCopied'))
  }

  async function switchPage(pageId: string) {
    setActivePageId(pageId)
    setBlocks([])
    setStatus('loading')
    try {
      const b = await fetchFunnelBlocks(pageId)
      setBlocks(b)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'error' || !funnel) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="text-center">
          <h3 className="text-lg font-semibold">{t('errorNotFound')}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {error ?? t('errorNotFound')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/funnels')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
        </Card>
      </div>
    )
  }

  const activePage = pages.find((p) => p.id === activePageId)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/funnels')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('cancel')}
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {funnel.name}
            </h1>
            <p className="text-muted-foreground text-sm">/{funnel.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              activePage &&
              window.open(
                `/funnels/${funnel.id}/preview/${activePage.path}`,
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            <Eye className="mr-2 h-4 w-4" />
            {t('preview')}
          </Button>
          {funnel.status !== 'published' && (
            <Button size="sm" onClick={handlePublish}>
              <Globe className="mr-2 h-4 w-4" />
              {t('publish')}
            </Button>
          )}
        </div>
      </div>

      {activePage?.step_type !== 'webinar_room' && (
        <Card className="mb-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="linkedWebinar">{t('linkWebinar')}</Label>
              <Select
                id="linkedWebinar"
                value={linkedWebinarId}
                onChange={(event) => {
                  setLinkedWebinarId(event.target.value)
                  setSettingsMessage(null)
                }}
              >
                <option value="">{t('noWebinar')}</option>
                {webinars.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => void handleSaveSettings()}
              isLoading={isSavingSettings}
              disabled={linkedWebinarId === (funnel.webinar_id ?? '')}
            >
              {isSavingSettings ? t('saving') : t('saveSettings')}
            </Button>
          </div>

          {funnel.status === 'published' && activePage ? (
            <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t('publicRegistrationLink')}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {`${window.location.origin}/f/${funnel.slug}/${activePage.path}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyPublicLink()}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('copyLink')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/f/${funnel.slug}/${activePage.path}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('openPublicPage')}
                </Button>
              </div>
            </div>
          ) : null}
          {settingsMessage ? (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
              {settingsMessage}
            </p>
          ) : null}
        </Card>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {pages.map((page) => (
          <Button
            key={page.id}
            variant={page.id === activePageId ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchPage(page.id)}
          >
            <PenLine className="mr-2 h-4 w-4" />
            {page.name}
          </Button>
        ))}
      </div>

      {activePage ? (
        activePage.step_type === 'webinar_room' ? (
          <CanonicalWebinarCard
            webinars={webinars}
            linkedWebinarId={linkedWebinarId}
            savedWebinarId={funnel.webinar_id ?? ''}
            isSaving={isSavingSettings}
            message={settingsMessage}
            onChange={(webinarId) => {
              setLinkedWebinarId(webinarId)
              setSettingsMessage(null)
            }}
            onSave={() => void handleSaveSettings()}
            onEdit={(webinarId) => navigate(`/webinars/${webinarId}/edit`)}
            onPreview={(slug) =>
              window.open(
                `/w/${slug}/room?preview=1`,
                '_blank',
                'noopener,noreferrer',
              )
            }
          />
        ) : (
          <FunnelEditor
            page={activePage}
            accountId={funnel.account_id}
            initialBlocks={blocks}
            onApplyTemplate={handleApplyTemplate}
          />
        )
      ) : (
        <Card className="py-12 text-center">
          <p className="text-muted-foreground">{t('noPages')}</p>
        </Card>
      )}

      {funnel && (
        <AiAssistant
          scope="funnel"
          scopeId={funnel.id}
          contextPrompt={`Help me build the funnel "${funnel.name}".`}
        />
      )}
    </div>
  )
}

function CanonicalWebinarCard({
  webinars,
  linkedWebinarId,
  savedWebinarId,
  isSaving,
  message,
  onChange,
  onSave,
  onEdit,
  onPreview,
}: {
  webinars: Webinar[]
  linkedWebinarId: string
  savedWebinarId: string
  isSaving: boolean
  message: string | null
  onChange: (webinarId: string) => void
  onSave: () => void
  onEdit: (webinarId: string) => void
  onPreview: (slug: string) => void
}) {
  const { t } = useTranslation('funnels')
  const webinar = webinars.find((item) => item.id === linkedWebinarId)

  return (
    <Card className="mx-auto max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 text-primary rounded-lg p-2.5">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {t('webinarRoomCanonicalTitle', {
              defaultValue: 'Linked webinar room',
            })}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('webinarRoomCanonicalDescription', {
              defaultValue:
                'This funnel uses the selected webinar’s canonical room and stream configuration.',
            })}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Label htmlFor="canonicalWebinar">{t('linkWebinar')}</Label>
        <Select
          id="canonicalWebinar"
          value={linkedWebinarId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{t('noWebinar')}</option>
          {webinars.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </Select>
      </div>

      {webinar ? (
        <div className="border-border bg-muted/40 mt-5 rounded-lg border p-4">
          <h3 className="font-semibold">{webinar.title}</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">
                {t('webinarStatus', { defaultValue: 'Status' })}
              </dt>
              <dd className="mt-0.5 font-medium capitalize">
                {t(`webinarStatuses.${webinar.status}`, {
                  defaultValue: webinar.status,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('webinarDate', { defaultValue: 'Date' })}
              </dt>
              <dd className="mt-0.5 font-medium">
                {webinar.scheduled_at
                  ? new Date(webinar.scheduled_at).toLocaleString()
                  : t('webinarDateNotSet', { defaultValue: 'Not scheduled' })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('webinarStreamType', { defaultValue: 'Stream type' })}
              </dt>
              <dd className="mt-0.5 font-medium capitalize">
                {t(`streamProviders.${webinar.stream_provider}`, {
                  defaultValue: webinar.stream_provider,
                })}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(webinar.id)}
            >
              <PenLine className="h-4 w-4" />
              {t('editLinkedWebinar', { defaultValue: 'Edit webinar' })}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPreview(webinar.slug)}
            >
              <Eye className="h-4 w-4" />
              {t('previewWebinarRoom', { defaultValue: 'Preview room' })}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground mt-5 text-sm">
          {t('selectCanonicalWebinar', {
            defaultValue: 'Select a webinar to configure this room.',
          })}
        </p>
      )}

      <div className="border-border mt-5 flex items-center justify-between gap-3 border-t pt-4">
        {message ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {message}
          </p>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          onClick={onSave}
          isLoading={isSaving}
          disabled={linkedWebinarId === savedWebinarId}
        >
          {isSaving ? t('saving') : t('saveSettings')}
        </Button>
      </div>
    </Card>
  )
}
