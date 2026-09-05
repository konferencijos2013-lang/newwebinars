import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Link2,
  Mail,
  MessageCircle,
  Send,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  configureTelegramBot,
  createTelegramBroadcast,
  fetchIntegrationConnections,
  fetchTelegramContactCount,
  fetchLatestTelegramBroadcast,
  fetchTelegramContacts,
  saveIntegrationConnection,
  uploadTelegramBroadcastImage,
  updateTelegramAiSettings,
  type TelegramBroadcast,
  type TelegramContact,
  type IntegrationConnection,
  type IntegrationProvider,
} from '@/features/settings/api/integrations'

export function IntegrationsPage() {
  const accountState = useAccount()
  if (accountState.status === 'loading')
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (accountState.status !== 'ready') return <Unavailable />
  return (
    <IntegrationSettings
      key={accountState.account.id}
      accountId={accountState.account.id}
      canManage={['owner', 'admin'].includes(accountState.membership.role)}
    />
  )
}

function Unavailable() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <Link2 className="text-muted-foreground mb-4 h-12 w-12" />
        <CardTitle>Integrations unavailable</CardTitle>
        <CardDescription className="mt-2">
          Sign in to manage account delivery integrations.
        </CardDescription>
      </Card>
    </div>
  )
}

type SaveInput = {
  provider: IntegrationProvider
  displayName: string
  credential: string
  config: Record<string, unknown>
}

function IntegrationSettings({
  accountId,
  canManage,
}: {
  accountId: string
  canManage: boolean
}) {
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConnections(await fetchIntegrationConnections(accountId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [accountId])
  useEffect(() => {
    // Start on the next microtask so the effect only subscribes to the request;
    // state updates happen as a result of that asynchronous request.
    void Promise.resolve().then(load)
  }, [load])
  const existing = (provider: IntegrationProvider) =>
    connections.find((item) => item.provider === provider) ?? null
  async function save(input: SaveInput) {
    setError(null)
    setNotice(null)
    try {
      await saveIntegrationConnection({ accountId, ...input })
      setNotice(
        `${input.displayName} saved. Its credential is encrypted in Vault and is never shown again.`,
      )
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect email and messaging providers for webinar reminders.
          Credentials are never exposed after saving.
        </p>
      </div>
      {!canManage && (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Only an account owner or administrator can change integrations.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
          {notice}
        </p>
      )}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <BrevoForm
            connection={existing('brevo')}
            disabled={!canManage}
            onSave={save}
          />
          <ResendForm
            connection={existing('resend')}
            disabled={!canManage}
            onSave={save}
          />
          <SmtpForm
            connection={existing('smtp')}
            disabled={!canManage}
            onSave={save}
          />
          <TelegramForm
            connection={existing('telegram')}
            disabled={!canManage}
            accountId={accountId}
          />
          <ManyChatForm
            connection={existing('manychat')}
            disabled={!canManage}
            onSave={save}
          />
        </>
      )}
      <Card className="bg-muted/30">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-green-600" />
          <div>
            <CardTitle className="text-base">Reliable delivery</CardTitle>
            <CardDescription className="mt-1">
              Every reminder is claimed once, logged, and retried up to five
              times on failure. Configure a scheduled call to the delivery
              worker before enabling live reminders.
            </CardDescription>
          </div>
        </div>
      </Card>
    </div>
  )
}

function useProviderSave(
  provider: IntegrationProvider,
  displayName: string,
  onSave: (value: SaveInput) => Promise<void>,
) {
  const [credential, setCredential] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(config: Record<string, unknown>) {
    setSaving(true)
    try {
      await onSave({ provider, displayName, credential, config })
      setCredential('')
    } finally {
      setSaving(false)
    }
  }
  return { credential, setCredential, saving, save }
}
function Status({ connection }: { connection: IntegrationConnection }) {
  return (
    <p className="text-muted-foreground mt-3 text-sm">
      Status:{' '}
      <span className="text-foreground font-medium">{connection.status}</span>
      {connection.last_error ? ` — latest error: ${connection.last_error}` : ''}
    </p>
  )
}
function ProviderCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </div>
      {children}
    </Card>
  )
}
function BrevoForm({
  connection,
  disabled,
  onSave,
}: {
  connection: IntegrationConnection | null
  disabled: boolean
  onSave: (v: SaveInput) => Promise<void>
}) {
  const [email, setEmail] = useState(
    String(connection?.config.from_email ?? ''),
  )
  const [name, setName] = useState(String(connection?.config.from_name ?? ''))
  const api = useProviderSave('brevo', 'Brevo email', onSave)
  return (
    <ProviderCard
      icon={<Mail className="text-primary mt-0.5 h-5 w-5" />}
      title="Brevo"
      description="Send webinar reminders with Brevo Transactional Email."
    >
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Input
          disabled={disabled || api.saving}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sender name"
        />
        <Input
          disabled={disabled || api.saving}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hello@yourdomain.com"
        />
        <Input
          disabled={disabled || api.saving}
          type="password"
          value={api.credential}
          onChange={(e) => api.setCredential(e.target.value)}
          placeholder={connection ? 'New Brevo API key' : 'Brevo API key'}
        />
      </div>
      {connection && <Status connection={connection} />}
      <Button
        className="mt-4"
        disabled={disabled || !email || !api.credential}
        isLoading={api.saving}
        onClick={() => void api.save({ from_email: email, from_name: name })}
      >
        {connection ? 'Update Brevo' : 'Connect Brevo'}
      </Button>
    </ProviderCard>
  )
}
function ResendForm({
  connection,
  disabled,
  onSave,
}: {
  connection: IntegrationConnection | null
  disabled: boolean
  onSave: (v: SaveInput) => Promise<void>
}) {
  const [fromEmail, setFromEmail] = useState(
    String(connection?.config.from_email ?? ''),
  )
  const api = useProviderSave('resend', 'Resend email', onSave)
  return (
    <ProviderCard
      icon={<Mail className="text-primary mt-0.5 h-5 w-5" />}
      title="Resend"
      description="Use Resend to send registration and webinar reminder emails."
    >
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Input
          disabled={disabled || api.saving}
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="Webinar <hello@yourdomain.com>"
        />
        <Input
          disabled={disabled || api.saving}
          type="password"
          value={api.credential}
          onChange={(e) => api.setCredential(e.target.value)}
          placeholder={connection ? 'New API key' : 're_… API key'}
        />
      </div>
      {connection && <Status connection={connection} />}
      <Button
        className="mt-4"
        disabled={disabled || !fromEmail || !api.credential}
        isLoading={api.saving}
        onClick={() => void api.save({ from_email: fromEmail })}
      >
        {connection ? 'Update Resend' : 'Connect Resend'}
      </Button>
    </ProviderCard>
  )
}
function SmtpForm({
  connection,
  disabled,
  onSave,
}: {
  connection: IntegrationConnection | null
  disabled: boolean
  onSave: (v: SaveInput) => Promise<void>
}) {
  const config = connection?.config ?? {}
  const [host, setHost] = useState(String(config.host ?? ''))
  const [port, setPort] = useState(String(config.port ?? '587'))
  const [username, setUsername] = useState(String(config.username ?? ''))
  const [fromEmail, setFromEmail] = useState(String(config.from_email ?? ''))
  const [secure, setSecure] = useState(config.secure === true)
  const api = useProviderSave('smtp', 'SMTP email', onSave)
  return (
    <ProviderCard
      icon={<Server className="text-primary mt-0.5 h-5 w-5" />}
      title="SMTP"
      description="Universal option for Google Workspace, Microsoft 365, Zoho, and private mail servers."
    >
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Input
          disabled={disabled || api.saving}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="smtp.example.com"
        />
        <Input
          disabled={disabled || api.saving}
          value={port}
          onChange={(e) => setPort(e.target.value)}
          inputMode="numeric"
          placeholder="587"
        />
        <Input
          disabled={disabled || api.saving}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="SMTP username"
        />
        <Input
          disabled={disabled || api.saving}
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="Sender email"
        />
        <Input
          className="sm:col-span-2"
          disabled={disabled || api.saving}
          type="password"
          value={api.credential}
          onChange={(e) => api.setCredential(e.target.value)}
          placeholder={
            connection ? 'New SMTP password' : 'SMTP password or app password'
          }
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={secure}
          disabled={disabled || api.saving}
          onChange={(e) => setSecure(e.target.checked)}
        />
        Use implicit TLS (usually port 465)
      </label>
      {connection && <Status connection={connection} />}
      <Button
        className="mt-4"
        disabled={
          disabled || !host || !username || !fromEmail || !api.credential
        }
        isLoading={api.saving}
        onClick={() =>
          void api.save({
            host,
            port: Number(port),
            username,
            from_email: fromEmail,
            secure,
          })
        }
      >
        {connection ? 'Update SMTP' : 'Connect SMTP'}
      </Button>
    </ProviderCard>
  )
}
function ManyChatForm({
  connection,
  disabled,
  onSave,
}: {
  connection: IntegrationConnection | null
  disabled: boolean
  onSave: (v: SaveInput) => Promise<void>
}) {
  const config = connection?.config ?? {}
  const [linkUrlTemplate, setLinkUrlTemplate] = useState(
    String(config.link_url_template ?? ''),
  )
  const api = useProviderSave('manychat', 'ManyChat', onSave)
  return (
    <ProviderCard
      icon={<MessageCircle className="text-primary mt-0.5 h-5 w-5" />}
      title="ManyChat"
      description="Universal reminder channel for Messenger, Instagram, WhatsApp or Telegram through your configured ManyChat flow."
    >
      <p className="text-muted-foreground mt-4 text-sm">
        In ManyChat create a flow which sends the `manychat_link_token` custom
        field to the webhook. Paste that flow's share URL below, replacing the
        token position with {'{{manychat_link_token}}'}.
      </p>
      <Input
        className="mt-3"
        disabled={disabled || api.saving}
        value={linkUrlTemplate}
        onChange={(e) => setLinkUrlTemplate(e.target.value)}
        placeholder="https://manychat.com/...?...={{manychat_link_token}}"
      />
      <Input
        className="mt-5"
        disabled={disabled || api.saving}
        type="password"
        value={api.credential}
        onChange={(e) => api.setCredential(e.target.value)}
        placeholder={connection ? 'New API key' : 'ManyChat API key'}
      />
      {connection && <Status connection={connection} />}
      <Button
        className="mt-4"
        disabled={
          disabled ||
          !api.credential ||
          !linkUrlTemplate.includes('{{manychat_link_token}}')
        }
        isLoading={api.saving}
        onClick={() => void api.save({ link_url_template: linkUrlTemplate })}
      >
        {connection ? 'Update ManyChat' : 'Connect ManyChat'}
      </Button>
    </ProviderCard>
  )
}

function TelegramForm({
  connection,
  disabled,
  accountId,
}: {
  connection: IntegrationConnection | null
  disabled: boolean
  accountId: string
}) {
  const initialConfig = connection?.config ?? {}
  const [credential, setCredential] = useState('')
  const [configuring, setConfiguring] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(
    initialConfig.ai_reply_enabled === true,
  )
  const [aiPrompt, setAiPrompt] = useState(
    String(
      initialConfig.ai_system_prompt ??
        'Tu esi webinarų virtualus asistentas. Atsakyk lietuviškai, trumpai, draugiškai ir tik pagal pateiktą informaciją. Jei atsakymo nežinai, aiškiai tai pasakyk ir nukreipk į administratorių.',
    ),
  )
  const [aiWelcome, setAiWelcome] = useState(
    String(
      initialConfig.ai_welcome_message ??
        'Sveiki! Parašykite savo klausimą, o virtualus asistentas pabandys padėti.',
    ),
  )
  const [aiFallback, setAiFallback] = useState(
    String(
      initialConfig.ai_fallback_message ??
        'Atsiprašau, šiuo metu negaliu atsakyti. Pabandykite dar kartą vėliau.',
    ),
  )
  const [savingAi, setSavingAi] = useState(false)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<TelegramContact[]>([])
  const [contactTotal, setContactTotal] = useState(0)
  const [eligibleContactTotal, setEligibleContactTotal] = useState(0)
  const [contactPage, setContactPage] = useState(0)
  const [contactSearch, setContactSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [message, setMessage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const uploadedImagePathRef = useRef<string | null>(null)
  const [audience, setAudience] = useState<'selected' | 'all'>('selected')
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [broadcast, setBroadcast] = useState<TelegramBroadcast | null>(null)
  const sendRequestKeyRef = useRef<string | null>(null)
  const pageSize = 20

  const loadContacts = useCallback(async () => {
    if (!connection) return
    setLoadingContacts(true)
    try {
      const [result, eligibleTotal] = await Promise.all([
        fetchTelegramContacts({
          accountId,
          connectionId: connection.id,
          page: contactPage,
          pageSize,
          search: contactSearch,
          eligibleOnly: true,
        }),
        fetchTelegramContactCount(accountId, connection.id),
      ])
      setContacts(result.contacts)
      setContactTotal(result.total)
      setEligibleContactTotal(eligibleTotal)
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoadingContacts(false)
    }
  }, [accountId, connection, contactPage, contactSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(), 0)
    return () => window.clearTimeout(timer)
  }, [loadContacts])
  useEffect(() => {
    if (!connection) return
    void fetchLatestTelegramBroadcast(connection.id)
      .then(setBroadcast)
      .catch(() => undefined)
  }, [connection])

  useEffect(() => {
    if (!broadcast || !['queued', 'processing'].includes(broadcast.status))
      return
    let active = true
    const refresh = async () => {
      try {
        const updated = await fetchLatestTelegramBroadcast(connection?.id ?? '')
        if (active && updated) {
          setBroadcast(updated)
          if (updated.status === 'completed') void loadContacts()
        }
      } catch (reason) {
        if (active)
          setSendError(
            reason instanceof Error ? reason.message : String(reason),
          )
      }
    }
    const interval = window.setInterval(() => void refresh(), 2000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [broadcast, connection, loadContacts])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  function chooseImage(file: File | null) {
    sendRequestKeyRef.current = null
    uploadedImagePathRef.current = null
    setImageFile(file)
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
    setSendError(null)
  }

  function toggleContact(contactId: string) {
    sendRequestKeyRef.current = null
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    )
  }

  async function sendMessage() {
    const trimmedMessage = message.trim()
    if (
      !connection ||
      !trimmedMessage ||
      (audience === 'selected' && selectedContactIds.length === 0)
    )
      return
    const target =
      audience === 'all'
        ? `visiems ${eligibleContactTotal} aktyviems kontaktams`
        : `${selectedContactIds.length} pasirinktiems kontaktams`
    if (!window.confirm(`Siųsti šią Telegram žinutę ${target}?`)) return
    setSending(true)
    setSendError(null)
    try {
      const requestKey = sendRequestKeyRef.current ?? crypto.randomUUID()
      sendRequestKeyRef.current = requestKey
      const imagePath = imageFile
        ? (uploadedImagePathRef.current ??= await uploadTelegramBroadcastImage(
            accountId,
            imageFile,
          ))
        : null
      const created = await createTelegramBroadcast({
        connectionId: connection.id,
        message: trimmedMessage,
        audience,
        requestKey,
        imagePath,
        contactIds: audience === 'selected' ? selectedContactIds : undefined,
      })
      setBroadcast(created)
      sendRequestKeyRef.current = null
      setMessage('')
      chooseImage(null)
      setSelectedContactIds([])
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSending(false)
    }
  }

  async function saveAiSettings() {
    if (!connection) return
    setSavingAi(true)
    setSetupError(null)
    setAiNotice(null)
    try {
      await updateTelegramAiSettings({
        connectionId: connection.id,
        enabled: aiEnabled,
        systemPrompt: aiPrompt.trim(),
        welcomeMessage: aiWelcome.trim(),
        fallbackMessage: aiFallback.trim(),
      })
      setAiNotice('DI atsakymų nustatymai išsaugoti.')
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingAi(false)
    }
  }

  async function connect() {
    setSetupError(null)
    setConfiguring(true)
    try {
      const saved = await saveIntegrationConnection({
        accountId,
        provider: 'telegram',
        displayName: 'Telegram Bot',
        config: {},
        credential,
      })
      await configureTelegramBot(saved.id)
      window.location.reload()
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setConfiguring(false)
    }
  }

  const completed = broadcast
    ? broadcast.sent_count + broadcast.failed_count + broadcast.blocked_count
    : 0
  const progress = broadcast?.recipient_count
    ? Math.round((completed / broadcast.recipient_count) * 100)
    : 0
  const pageCount = Math.max(1, Math.ceil(contactTotal / pageSize))
  const allPageSelected =
    contacts.length > 0 &&
    contacts.every((contact) => selectedContactIds.includes(contact.id))
  const broadcastActive =
    broadcast != null && ['queued', 'processing'].includes(broadcast.status)

  return (
    <ProviderCard
      icon={<Send className="text-primary mt-0.5 h-5 w-5" />}
      title="Telegram Bot"
      description="Collect consenting Telegram contacts and send scheduled webinar reminders directly through your bot."
    >
      <p className="text-muted-foreground mt-4 text-sm">
        Create a bot with @BotFather and paste its HTTP API token. The platform
        validates the bot and configures its webhook automatically.
      </p>
      <Input
        className="mt-4"
        disabled={disabled || configuring || broadcastActive}
        type="password"
        value={credential}
        onChange={(event) => setCredential(event.target.value)}
        placeholder={
          connection ? 'New BotFather token' : '123456:AA… BotFather token'
        }
      />
      {connection && (
        <>
          <Status connection={connection} />
          {connection.config.bot_username && (
            <p className="text-muted-foreground mt-1 text-sm">
              Bot: @{String(connection.config.bot_username)}
            </p>
          )}
        </>
      )}
      {setupError && <p className="mt-3 text-sm text-red-600">{setupError}</p>}
      {connection?.status === 'active' && (
        <div className="border-border mt-5 border-t pt-5">
          <h3 className="text-sm font-semibold">DI automatiniai atsakymai</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Virtualus asistentas atsakys į privačias boto žinutes pagal jūsų
            promptą ir paskelbtų webinarų informaciją. Komandos, įskaitant
            /stop, nėra perduodamos DI.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={aiEnabled}
              disabled={disabled || savingAi}
              onChange={(event) => setAiEnabled(event.target.checked)}
            />
            Įjungti DI atsakymus
          </label>
          <label
            className="mt-3 block text-sm font-medium"
            htmlFor="telegram-ai-prompt"
          >
            DI sistemos promptas
          </label>
          <Textarea
            id="telegram-ai-prompt"
            className="mt-1 min-h-36"
            disabled={disabled || savingAi}
            maxLength={12000}
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Aprašykite, kaip virtualus asistentas turi atsakyti..."
          />
          <p className="text-muted-foreground mt-1 text-right text-xs">
            {aiPrompt.length}/12000
          </p>
          <label
            className="mt-3 block text-sm font-medium"
            htmlFor="telegram-ai-welcome"
          >
            Atsakymas į paprastą /start
          </label>
          <Textarea
            id="telegram-ai-welcome"
            className="mt-1"
            disabled={disabled || savingAi}
            maxLength={4096}
            value={aiWelcome}
            onChange={(event) => setAiWelcome(event.target.value)}
          />
          <label
            className="mt-3 block text-sm font-medium"
            htmlFor="telegram-ai-fallback"
          >
            Atsarginis atsakymas, jei DI nepasiekiamas
          </label>
          <Textarea
            id="telegram-ai-fallback"
            className="mt-1"
            disabled={disabled || savingAi}
            maxLength={4096}
            value={aiFallback}
            onChange={(event) => setAiFallback(event.target.value)}
          />
          {aiNotice && (
            <p className="mt-2 text-sm text-green-600">{aiNotice}</p>
          )}
          <Button
            className="mt-3"
            disabled={
              disabled || savingAi || (aiEnabled && aiPrompt.trim().length < 20)
            }
            isLoading={savingAi}
            onClick={() => void saveAiSettings()}
          >
            Išsaugoti DI nustatymus
          </Button>
        </div>
      )}
      {connection?.status === 'active' && (
        <div className="border-border mt-5 border-t pt-5">
          <h3 className="text-sm font-semibold">Siųsti Telegram žinutę</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Pasirinkite gavėjus arba siųskite visiems aktyviems kontaktams.
            Didesni siuntimai automatiškai vykdomi dalimis.
          </p>
          <Textarea
            className="mt-3 min-h-28"
            disabled={disabled || sending || broadcastActive}
            maxLength={4096}
            value={message}
            onChange={(event) => {
              sendRequestKeyRef.current = null
              setMessage(event.target.value)
            }}
            placeholder="Įrašykite Telegram žinutę..."
          />
          <p className="text-muted-foreground mt-1 text-right text-xs">
            {message.length}/4096
          </p>
          <div className="mt-3">
            <label className="text-sm font-medium" htmlFor="telegram-photo">
              Nuotrauka prieš tekstą (nebūtina)
            </label>
            <Input
              id="telegram-photo"
              className="mt-1"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled || sending || broadcastActive}
              onChange={(event) => chooseImage(event.target.files?.[0] ?? null)}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              JPG, PNG arba WEBP, iki 10 MB. Nuotrauka bus išsiųsta prieš
              žinutės tekstą.
            </p>
            {imagePreviewUrl && (
              <div className="mt-2 flex items-start gap-3">
                <img
                  src={imagePreviewUrl}
                  alt="Pasirinktos Telegram nuotraukos peržiūra"
                  className="max-h-40 max-w-56 rounded-md object-contain"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || sending || broadcastActive}
                  onClick={() => chooseImage(null)}
                >
                  Pašalinti
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={audience === 'selected'}
                disabled={disabled || broadcastActive}
                onChange={() => {
                  sendRequestKeyRef.current = null
                  setAudience('selected')
                }}
              />
              Pasirinkti kontaktai
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={audience === 'all'}
                disabled={disabled || broadcastActive}
                onChange={() => {
                  sendRequestKeyRef.current = null
                  setAudience('all')
                }}
              />
              Siųsti visiems ({eligibleContactTotal})
            </label>
          </div>
          {audience === 'selected' && (
            <>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  setContactPage(0)
                  setContactSearch(searchInput)
                }}
              >
                <Input
                  value={searchInput}
                  disabled={disabled || broadcastActive}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Ieškoti pagal vardą, @username ar Telegram ID"
                />
                <Button type="submit" variant="outline">
                  Ieškoti
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Pasirinkta: {selectedContactIds.length} · Rasta:{' '}
                  {contactTotal}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    disabled || broadcastActive || contacts.length === 0
                  }
                  onClick={() => {
                    sendRequestKeyRef.current = null
                    setSelectedContactIds((current) => {
                      const pageIds = contacts.map((contact) => contact.id)
                      return allPageSelected
                        ? current.filter((id) => !pageIds.includes(id))
                        : [...new Set([...current, ...pageIds])]
                    })
                  }}
                >
                  {allPageSelected ? 'Atžymėti puslapį' : 'Pasirinkti puslapį'}
                </Button>
              </div>
              <div className="border-border mt-2 min-h-32 space-y-1 rounded-md border p-2">
                {loadingContacts ? (
                  <div className="flex h-28 items-center justify-center">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : contacts.length ? (
                  contacts.map((contact) => {
                    const name = [contact.first_name, contact.last_name]
                      .filter(Boolean)
                      .join(' ')
                    const label =
                      name ||
                      (contact.username
                        ? `@${contact.username}`
                        : `Telegram ID ${contact.telegram_user_id ?? contact.chat_id}`)
                    return (
                      <label
                        key={contact.id}
                        className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedContactIds.includes(contact.id)}
                          disabled={disabled || broadcastActive}
                          onChange={() => toggleContact(contact.id)}
                        />
                        <span>{label}</span>
                      </label>
                    )
                  })
                ) : (
                  <p className="text-muted-foreground p-3 text-center text-sm">
                    Kontaktų nerasta.
                  </p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactPage === 0 || loadingContacts}
                  onClick={() => setContactPage((page) => page - 1)}
                >
                  Ankstesnis
                </Button>
                <span className="text-muted-foreground text-xs">
                  {contactPage + 1} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={contactPage + 1 >= pageCount || loadingContacts}
                  onClick={() => setContactPage((page) => page + 1)}
                >
                  Kitas
                </Button>
              </div>
            </>
          )}
          <Button
            className="mt-3"
            disabled={
              disabled ||
              sending ||
              broadcastActive ||
              !message.trim() ||
              eligibleContactTotal === 0 ||
              (audience === 'selected' && selectedContactIds.length === 0)
            }
            isLoading={sending}
            onClick={() => void sendMessage()}
          >
            {audience === 'all'
              ? `Siųsti visiems (${eligibleContactTotal})`
              : `Siųsti pasirinktiems (${selectedContactIds.length})`}
          </Button>
          {broadcast && (
            <div className="bg-muted/40 mt-4 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {broadcast.status === 'completed'
                    ? 'Siuntimas baigtas'
                    : 'Vyksta siuntimas'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Apdorota {completed} iš {broadcast.recipient_count} · Išsiųsta:{' '}
                {broadcast.sent_count} · Nepavyko: {broadcast.failed_count} ·
                Užblokavo botą: {broadcast.blocked_count}
              </p>
            </div>
          )}
          {sendError && (
            <p className="mt-3 text-sm text-red-600">{sendError}</p>
          )}
        </div>
      )}
      <Button
        className="mt-4"
        disabled={disabled || !credential || configuring || broadcastActive}
        isLoading={configuring}
        onClick={() => void connect()}
      >
        {connection ? 'Update Telegram Bot' : 'Connect Telegram Bot'}
      </Button>
    </ProviderCard>
  )
}
