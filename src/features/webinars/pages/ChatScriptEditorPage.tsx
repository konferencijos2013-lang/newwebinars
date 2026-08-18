import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  Bot,
  Download,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import {
  createCtaEvent,
  deleteCtaEvent,
  fetchCtaEventsForEditor,
  fetchOffer,
  saveOffer,
  updateCtaEvent,
  type CtaEvent,
} from '@/features/webinars/api/offers'
import { updateWebinar } from '@/features/webinars/api/webinars'
import {
  bulkInsertChatScripts,
  createChatScript,
  deleteChatScript,
  fetchChatScriptsForEditor,
  importLastLiveSessionAsScript,
  updateChatScript,
} from '@/features/webinars/api/chatScripts'
import { fetchWebinar } from '@/features/webinars/api/webinars'
import { supabase } from '@/lib/supabase'
import type {
  ChatScriptSenderRole,
  Webinar,
  WebinarChatScript,
} from '@/shared/database.types'

type ScriptDraft = Pick<
  WebinarChatScript,
  'trigger_seconds' | 'display_name' | 'sender_role' | 'message' | 'is_active'
>

const emptyDraft: ScriptDraft = {
  trigger_seconds: 0,
  display_name: '',
  sender_role: 'attendee',
  message: '',
  is_active: true,
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs]
    .map((value, index) =>
      index === 0 ? String(value) : String(value).padStart(2, '0'),
    )
    .join(':')
}

export function ChatScriptEditorPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [webinar, setWebinar] = useState<Webinar | null>(null)
  const [scripts, setScripts] = useState<WebinarChatScript[]>([])
  const [ctaEvents, setCtaEvents] = useState<CtaEvent[]>([])
  const [offerTitle, setOfferTitle] = useState('')
  const [offerButtonText, setOfferButtonText] = useState('')
  const [offerUrl, setOfferUrl] = useState('')
  const [offerActive, setOfferActive] = useState(true)
  const [newCtaTime, setNewCtaTime] = useState(0)
  const [newCtaAction, setNewCtaAction] = useState<'show' | 'hide'>('show')
  const [newLine, setNewLine] = useState<ScriptDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<'import' | 'generate' | 'add' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  const activeCount = useMemo(
    () => scripts.filter((line) => line.is_active).length,
    [scripts],
  )

  const reload = useCallback(async () => {
    if (!id) return
    const [nextWebinar, nextScripts, nextCtaEvents, nextOffer] =
      await Promise.all([
        fetchWebinar(id),
        fetchChatScriptsForEditor(id),
        fetchCtaEventsForEditor(id),
        fetchOffer(id),
      ])
    setWebinar(nextWebinar)
    setScripts(nextScripts)
    setCtaEvents(nextCtaEvents)
    setOfferTitle(nextOffer?.title ?? '')
    setOfferButtonText(nextOffer?.button_text ?? '')
    setOfferUrl(nextOffer?.target_url ?? '')
    setOfferActive(nextOffer?.active ?? true)
  }, [id])

  useEffect(() => {
    void Promise.resolve()
      .then(reload)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setLoading(false))
  }, [reload])

  async function persist(id: string, patch: Partial<ScriptDraft>) {
    setError(null)
    try {
      const updated = await updateChatScript(id, patch)
      setScripts((lines) =>
        lines.map((line) => (line.id === id ? updated : line)),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function addLine() {
    if (!id || !newLine.display_name.trim() || !newLine.message.trim()) return
    setWorking('add')
    setError(null)
    try {
      const line = await createChatScript({
        webinar_id: id,
        ...newLine,
        display_name: newLine.display_name.trim(),
        message: newLine.message.trim(),
        sort_order: scripts.length,
        source: 'manual',
      })
      setScripts((lines) =>
        [...lines, line].sort((a, b) => a.trigger_seconds - b.trigger_seconds),
      )
      setNewLine(emptyDraft)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWorking(null)
    }
  }

  async function removeLine(lineId: string) {
    if (!window.confirm('Delete this chat message?')) return
    setError(null)
    try {
      await deleteChatScript(lineId)
      setScripts((lines) => lines.filter((line) => line.id !== lineId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function importLiveChat() {
    if (
      !id ||
      !window.confirm('Import the latest live webinar chat into this scenario?')
    )
      return
    setWorking('import')
    setError(null)
    try {
      await importLastLiveSessionAsScript(id)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWorking(null)
    }
  }

  async function generateWithAi() {
    if (
      !id ||
      !window.confirm(
        'Generate additional realistic chat messages with AI? You can edit them afterwards.',
      )
    )
      return
    setWorking('generate')
    setError(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'generate-chat-script',
        {
          body: { webinar_id: id, count: 16 },
        },
      )
      if (invokeError) throw invokeError
      if (!data?.scripts?.length)
        throw new Error(data?.error ?? 'AI returned no chat messages')
      await bulkInsertChatScripts(
        data.scripts.map((line: ScriptDraft, index: number) => ({
          webinar_id: id,
          ...line,
          sort_order: scripts.length + index,
          source: 'ai' as const,
        })),
      )
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWorking(null)
    }
  }

  async function saveCtaSettings() {
    if (
      !id ||
      !offerTitle.trim() ||
      !offerButtonText.trim() ||
      !offerUrl.trim()
    )
      return
    setError(null)
    try {
      const updated = await Promise.all([
        saveOffer({
          webinar_id: id,
          title: offerTitle.trim(),
          description: null,
          button_text: offerButtonText.trim(),
          target_url: offerUrl.trim(),
          active: offerActive,
        }),
        updateWebinar(id, {
          chat_script_offset_seconds: webinar?.chat_script_offset_seconds ?? 0,
        }),
      ])
      setOfferActive(updated[0].active)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function addCtaEvent() {
    if (!id) return
    try {
      const event = await createCtaEvent({
        webinar_id: id,
        trigger_seconds: newCtaTime,
        action: newCtaAction,
        sort_order: ctaEvents.length,
      })
      setCtaEvents((rows) => [...rows, event])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate(`/webinars/${id}`)}
      >
        <ArrowLeft className="h-4 w-4" /> Back to webinar
      </Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            Chat scenario
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {webinar?.title ?? 'Webinar'} · {activeCount} active messages
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={importLiveChat}
            isLoading={working === 'import'}
          >
            <Download className="h-4 w-4" /> Import latest live chat
          </Button>
          <Button onClick={generateWithAi} isLoading={working === 'generate'}>
            <Bot className="h-4 w-4" /> Generate with AI
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <Card className="mb-6">
        <CardTitle className="text-base">Pardavimo mygtukas</CardTitle>
        <CardDescription className="mt-1">
          Vienas mygtukas rodomas po webinaro video. Evergreen laiko veiksmai
          valdo jo matomumą.
        </CardDescription>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Pasiūlymo pavadinimas"
            value={offerTitle}
            onChange={(e) => setOfferTitle(e.target.value)}
          />
          <Input
            placeholder="Mygtuko tekstas"
            value={offerButtonText}
            onChange={(e) => setOfferButtonText(e.target.value)}
          />
          <Input
            type="url"
            placeholder="https://produkto-puslapis.lt"
            value={offerUrl}
            onChange={(e) => setOfferUrl(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offerActive}
              onChange={(e) => setOfferActive(e.target.checked)}
            />{' '}
            Įjungtas
          </label>
          <Button size="sm" onClick={() => void saveCtaSettings()}>
            Išsaugoti mygtuką
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <CardTitle className="text-base">
          Čato scenarijaus laiko poslinkis
        </CardTitle>
        <CardDescription className="mt-1">
          Teigiamas skaičius vėlina visą čatą ir pasiūlymo veiksmus, neigiamas —
          paankstina.
        </CardDescription>
        <div className="mt-4 flex gap-3">
          <Input
            type="number"
            value={webinar?.chat_script_offset_seconds ?? 0}
            onChange={(e) =>
              setWebinar((current) =>
                current
                  ? {
                      ...current,
                      chat_script_offset_seconds: Number(e.target.value) || 0,
                    }
                  : current,
              )
            }
          />
          <Button
            onClick={() =>
              id &&
              webinar &&
              void updateWebinar(id, {
                chat_script_offset_seconds: webinar.chat_script_offset_seconds,
              })
            }
          >
            Išsaugoti poslinkį
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <CardTitle className="text-base">
          Pardavimo mygtuko laiko veiksmai
        </CardTitle>
        <CardDescription className="mt-1">
          Šie veiksmai evergreen webinarui taikomi kartu su bendru scenarijaus
          laiko poslinkiu.
        </CardDescription>
        <div className="mt-4 flex flex-wrap gap-3">
          <Input
            className="w-36"
            type="number"
            min="0"
            value={newCtaTime}
            onChange={(e) => setNewCtaTime(Math.max(0, Number(e.target.value)))}
          />
          <select
            className="border-border bg-background h-9 rounded-md border px-3 text-sm"
            value={newCtaAction}
            onChange={(e) => setNewCtaAction(e.target.value as 'show' | 'hide')}
          >
            <option value="show">Rodyti mygtuką</option>
            <option value="hide">Slėpti mygtuką</option>
          </select>
          <Button size="sm" onClick={() => void addCtaEvent()}>
            Pridėti veiksmą
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {ctaEvents.map((event) => (
            <div
              className="flex items-center justify-between rounded border p-2 text-sm"
              key={event.id}
            >
              <span>
                {formatTime(event.trigger_seconds)} ·{' '}
                {event.action === 'show' ? 'Rodyti' : 'Slėpti'}
              </span>
              <div className="flex gap-2">
                <label>
                  <input
                    type="checkbox"
                    checked={event.is_active}
                    onChange={(e) => {
                      void updateCtaEvent(event.id, {
                        is_active: e.target.checked,
                      }).then((updated) =>
                        setCtaEvents((rows) =>
                          rows.map((row) =>
                            row.id === updated.id ? updated : row,
                          ),
                        ),
                      )
                    }}
                  />{' '}
                  Aktyvus
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void deleteCtaEvent(event.id).then(() =>
                      setCtaEvents((rows) =>
                        rows.filter((row) => row.id !== event.id),
                      ),
                    )
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <CardTitle className="text-base">Add a message</CardTitle>
        <CardDescription className="mt-1">
          Time is measured from the beginning of the webinar.
        </CardDescription>
        <div className="mt-4 grid gap-3 md:grid-cols-[110px_150px_150px_1fr_auto]">
          <Input
            type="number"
            min="0"
            value={newLine.trigger_seconds}
            aria-label="Time in seconds"
            onChange={(event) =>
              setNewLine((line) => ({
                ...line,
                trigger_seconds: Math.max(0, Number(event.target.value)),
              }))
            }
          />
          <Input
            placeholder="Name"
            value={newLine.display_name}
            onChange={(event) =>
              setNewLine((line) => ({
                ...line,
                display_name: event.target.value,
              }))
            }
          />
          <select
            className="border-border bg-background h-9 rounded-md border px-3 text-sm"
            value={newLine.sender_role}
            onChange={(event) =>
              setNewLine((line) => ({
                ...line,
                sender_role: event.target.value as ChatScriptSenderRole,
              }))
            }
          >
            <option value="attendee">Attendee</option>
            <option value="host">Host</option>
          </select>
          <Input
            placeholder="Message"
            value={newLine.message}
            onChange={(event) =>
              setNewLine((line) => ({ ...line, message: event.target.value }))
            }
          />
          <Button onClick={addLine} isLoading={working === 'add'}>
            <MessageSquarePlus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {scripts.length === 0 ? (
          <Card>
            <CardDescription>
              No scenario messages yet. Add one, import a finished live chat, or
              generate a draft with AI.
            </CardDescription>
          </Card>
        ) : (
          scripts.map((line) => (
            <Card
              key={line.id}
              className={!line.is_active ? 'opacity-55' : undefined}
            >
              <div className="grid gap-3 md:grid-cols-[105px_145px_140px_1fr_auto] md:items-start">
                <div>
                  <label className="text-muted-foreground text-xs">Time</label>
                  <Input
                    type="number"
                    min="0"
                    value={line.trigger_seconds}
                    onBlur={(event) =>
                      void persist(line.id, {
                        trigger_seconds: Math.max(
                          0,
                          Number(event.target.value),
                        ),
                      })
                    }
                    onChange={(event) =>
                      setScripts((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? {
                                ...item,
                                trigger_seconds: Math.max(
                                  0,
                                  Number(event.target.value),
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatTime(line.trigger_seconds)}
                  </p>
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">Name</label>
                  <Input
                    value={line.display_name}
                    onBlur={(event) =>
                      void persist(line.id, {
                        display_name: event.target.value.trim(),
                      })
                    }
                    onChange={(event) =>
                      setScripts((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? { ...item, display_name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">Role</label>
                  <select
                    className="border-border bg-background h-9 w-full rounded-md border px-3 text-sm"
                    value={line.sender_role}
                    onChange={(event) => {
                      const sender_role = event.target
                        .value as ChatScriptSenderRole
                      setScripts((items) =>
                        items.map((item) =>
                          item.id === line.id ? { ...item, sender_role } : item,
                        ),
                      )
                      void persist(line.id, { sender_role })
                    }}
                  >
                    <option value="attendee">Attendee</option>
                    <option value="host">Host</option>
                  </select>
                  <p className="text-muted-foreground mt-1 text-xs capitalize">
                    {line.source}
                  </p>
                </div>
                <div>
                  <label className="text-muted-foreground text-xs">
                    Message
                  </label>
                  <Textarea
                    className="min-h-[68px]"
                    value={line.message}
                    onBlur={(event) =>
                      void persist(line.id, {
                        message: event.target.value.trim(),
                      })
                    }
                    onChange={(event) =>
                      setScripts((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? { ...item, message: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex gap-2 pt-5 md:flex-col">
                  <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={line.is_active}
                      onChange={(event) => {
                        const is_active = event.target.checked
                        setScripts((items) =>
                          items.map((item) =>
                            item.id === line.id ? { ...item, is_active } : item,
                          ),
                        )
                        void persist(line.id, { is_active })
                      }}
                    />{' '}
                    Active
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete message"
                    onClick={() => void removeLine(line.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
