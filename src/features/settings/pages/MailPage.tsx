import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { useAccount } from '@/features/auth/hooks/useAccount'
import {
  createEmailBroadcast,
  deleteEmailContact,
  fetchAllEmailContacts,
  fetchEmailContacts,
  fetchLatestEmailBroadcast,
  importEmailContacts,
  setEmailContactStatus,
  type EmailBroadcast,
  type EmailContact,
} from '@/features/settings/api/emailContacts'
import {
  createContactTag,
  deleteContactTag,
  fetchContactTags,
  listEmailBroadcastContactIds,
  setContactTag,
  type ContactTag,
  type TagCondition,
  type TagMatch,
} from '@/features/settings/api/contactTags'
import {
  ContactTagFilters,
  ContactTagPicker,
} from '@/features/settings/components/ContactTagControls'
import {
  fetchIntegrationConnections,
  type IntegrationConnection,
} from '@/features/settings/api/integrations'
import {
  emailContactsToCsv,
  parseEmailContactsCsv,
} from '@/features/settings/emailContactsCsv'

const PAGE_SIZE = 20
const EMAIL_PROVIDERS = ['brevo', 'resend', 'smtp']

function providerLabel(provider: string) {
  if (provider === 'brevo') return 'Brevo'
  if (provider === 'resend') return 'Resend'
  return 'SMTP'
}

export function MailPage() {
  const { t } = useTranslation('mail')
  const { t: tCommon } = useTranslation('common')
  const accountState = useAccount()
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [contacts, setContacts] = useState<EmailContact[]>([])
  const [total, setTotal] = useState(0)
  const [activeTotal, setActiveTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tags, setTags] = useState<ContactTag[]>([])
  const [tagConditions, setTagConditions] = useState<TagCondition[]>([])
  const [tagMatch, setTagMatch] = useState<TagMatch>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selecting, setSelecting] = useState(false)
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [broadcast, setBroadcast] = useState<EmailBroadcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestKeyRef = useRef<string | null>(null)

  const accountId =
    accountState.status === 'ready' ? accountState.account.id : null
  const disabled =
    accountState.status !== 'ready' ||
    !['owner', 'admin'].includes(accountState.membership.role)
  const running =
    broadcast?.status === 'queued' || broadcast?.status === 'processing'

  const loadContacts = useCallback(async () => {
    if (!accountId) return
    const result = await fetchEmailContacts({
      accountId,
      page,
      pageSize: PAGE_SIZE,
      search,
      tagConditions,
      tagMatch,
    })
    setContacts(result.contacts)
    setTotal(result.total)
    setActiveTotal(result.active)
  }, [accountId, page, search, tagConditions, tagMatch])

  useEffect(() => {
    if (!accountId) return
    let active = true
    setLoading(true)
    void Promise.all([
      fetchIntegrationConnections(accountId),
      fetchLatestEmailBroadcast(accountId),
      fetchContactTags(accountId),
    ])
      .then(([items, latest, loadedTags]) => {
        if (!active) return
        setTags(loadedTags)
        const emailConnections = items.filter(
          (item) =>
            EMAIL_PROVIDERS.includes(item.provider) && item.status === 'active',
        )
        setConnections(emailConnections)
        setConnectionId((current) => current || emailConnections[0]?.id || '')
        setBroadcast(latest)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accountId])

  useEffect(() => {
    if (!accountId) return
    let active = true
    void loadContacts().catch((reason) => {
      if (active)
        setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => {
      active = false
    }
  }, [accountId, loadContacts])

  useEffect(() => {
    if (!accountId || !running) return
    const timer = window.setInterval(() => {
      void fetchLatestEmailBroadcast(accountId)
        .then((latest) => {
          setBroadcast(latest)
          if (latest?.status === 'completed') void loadContacts()
        })
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [accountId, running, loadContacts])

  async function send() {
    if (!connectionId) return
    const target =
      audience === 'all'
        ? t('targetActive', { count: activeTotal })
        : t('targetSelected', { count: selectedIds.length })
    if (!window.confirm(t('confirmSend', { target }))) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      requestKeyRef.current ??= crypto.randomUUID()
      const created = await createEmailBroadcast({
        connectionId,
        subject,
        message,
        audience,
        contactIds: audience === 'selected' ? selectedIds : undefined,
        tagConditions,
        tagMatch,
        requestKey: requestKeyRef.current,
      })
      requestKeyRef.current = null
      setBroadcast(created)
      setSelectedIds([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSending(false)
    }
  }

  async function changeStatus(contact: EmailContact, status: 'active' | 'blocked') {
    setBusyId(contact.id)
    setError(null)
    try {
      await setEmailContactStatus(contact.id, status)
      await loadContacts()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(contact: EmailContact) {
    if (!window.confirm(t('confirmDelete', { email: contact.email }))) return
    setBusyId(contact.id)
    setError(null)
    try {
      await deleteEmailContact(contact.id)
      setSelectedIds((current) => current.filter((id) => id !== contact.id))
      await loadContacts()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyId(null)
    }
  }

  async function selectAllMatching() {
    if (!accountId) return
    setSelecting(true)
    setError(null)
    try {
      const ids = await listEmailBroadcastContactIds({
        accountId,
        search,
        tagConditions,
        tagMatch,
      })
      if (ids.length === 0) {
        setError(tCommon('tags.selectNone'))
        return
      }
      requestKeyRef.current = null
      setSelectedIds(ids)
      setAudience('selected')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSelecting(false)
    }
  }

  function clearSelection() {
    requestKeyRef.current = null
    setSelectedIds([])
  }

  async function exportContacts() {
    if (!accountId) return
    setExporting(true)
    setError(null)
    try {
      const rows = await fetchAllEmailContacts(accountId)
      const blob = new Blob([emailContactsToCsv(rows)], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'el-pasto-kontaktai.csv'
      link.click()
      URL.revokeObjectURL(url)
      setNotice(t('exported', { count: rows.length }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  async function importFile(file: File) {
    if (!accountId) return
    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const rows = parseEmailContactsCsv(await file.text()).filter((row) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email),
      )
      if (rows.length === 0) {
        setError(t('csvEmpty'))
        return
      }
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (let index = 0; index < rows.length; index += 1000) {
        const result = await importEmailContacts(
          accountId,
          rows.slice(index, index + 1000),
        )
        inserted += result.inserted
        updated += result.updated
        skipped += result.skipped
      }
      setNotice(t('imported', { inserted, updated, skipped }))
      setPage(0)
      await loadContacts()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setImporting(false)
    }
  }

  if (accountState.status === 'loading' || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (!accountId) {
    return (
      <Card className="mx-auto max-w-3xl text-center">
        <CardTitle>{t('unavailable')}</CardTitle>
      </Card>
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const progress = broadcast?.recipient_count
    ? Math.round(
        ((broadcast.sent_count +
          broadcast.failed_count +
          broadcast.blocked_count) /
          broadcast.recipient_count) *
          100,
      )
    : 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Mail className="h-6 w-6" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardTitle>{t('noProviderTitle')}</CardTitle>
          <CardDescription className="mt-2">
            {t('noProviderDescription')}
          </CardDescription>
          <Link
            className="bg-primary text-primary-foreground mt-4 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
            to="/integrations"
          >
            {t('openIntegrations')}
          </Link>
        </Card>
      ) : (
        <Card>
          <CardTitle>{t('sendTitle')}</CardTitle>
          <label className="mt-4 block text-sm font-medium" htmlFor="mail-provider">
            {t('provider')}
          </label>
          <select
            id="mail-provider"
            className="border-border bg-background mt-1 h-9 w-full rounded-md border px-3 text-sm"
            value={connectionId}
            disabled={disabled || running}
            onChange={(event) => {
              requestKeyRef.current = null
              setConnectionId(event.target.value)
            }}
          >
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {providerLabel(connection.provider)} ·{' '}
                {String(connection.config.from_email ?? connection.display_name)}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-sm font-medium" htmlFor="mail-subject">
            {t('subject')}
          </label>
          <Input
            id="mail-subject"
            className="mt-1"
            maxLength={200}
            value={subject}
            disabled={disabled || running}
            onChange={(event) => {
              requestKeyRef.current = null
              setSubject(event.target.value)
            }}
          />
          <label className="mt-3 block text-sm font-medium" htmlFor="mail-body">
            {t('body')}
          </label>
          <Textarea
            id="mail-body"
            className="mt-1 min-h-36"
            maxLength={8000}
            value={message}
            disabled={disabled || running}
            onChange={(event) => {
              requestKeyRef.current = null
              setMessage(event.target.value)
            }}
          />
          <ContactTagFilters
            tags={tags}
            conditions={tagConditions}
            match={tagMatch}
            disabled={disabled || running}
            onChange={(conditions, match) => {
              requestKeyRef.current = null
              setPage(0)
              setTagConditions(conditions)
              setTagMatch(match)
            }}
            onCreate={async (name) => {
              const created = await createContactTag(accountId, name)
              setTags((current) =>
                [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
              )
            }}
            onDelete={async (tag) => {
              await deleteContactTag(tag.id)
              setTags((current) => current.filter((item) => item.id !== tag.id))
              setTagConditions((current) =>
                current.filter((item) => item.tagId !== tag.id),
              )
              setContacts((current) =>
                current.map((contact) => ({
                  ...contact,
                  tagIds: contact.tagIds.filter((id) => id !== tag.id),
                })),
              )
            }}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audience === 'all'}
                disabled={disabled || running}
                onChange={() => setAudience('all')}
              />
              {t('audienceAll', { count: activeTotal })}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audience === 'selected'}
                disabled={disabled || running}
                onChange={() => setAudience('selected')}
              />
              {t('audienceSelected', { count: selectedIds.length })}
            </label>
          </div>
          <Button
            className="mt-3"
            disabled={
              disabled ||
              sending ||
              running ||
              !subject.trim() ||
              !message.trim() ||
              (audience === 'all' ? activeTotal === 0 : selectedIds.length === 0)
            }
            isLoading={sending}
            onClick={() => void send()}
          >
            {t('send')}
          </Button>
          {broadcast && (
            <div className="bg-muted/40 mt-4 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {broadcast.status === 'completed' ? t('finished') : t('running')}
                  : {broadcast.subject}
                </span>
                <span>{progress}%</span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                {t('stats', {
                  sent: broadcast.sent_count,
                  total: broadcast.recipient_count,
                  failed: broadcast.failed_count,
                  skipped: broadcast.blocked_count,
                })}
              </p>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>{t('listTitle')}</CardTitle>
        <CardDescription className="mt-1">
          {t('listDescription')}
        </CardDescription>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form
            className="flex min-w-64 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(0)
              setSearch(searchInput)
            }}
          >
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('searchPlaceholder')}
            />
            <Button type="submit" variant="outline">
              {t('search')}
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || running || selecting || total === 0}
            isLoading={selecting}
            onClick={() => void selectAllMatching()}
          >
            {tCommon('tags.selectAll')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || running || selectedIds.length === 0}
            onClick={clearSelection}
          >
            {tCommon('tags.clearSelection')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || exporting || total === 0}
            isLoading={exporting}
            onClick={() => void exportContacts()}
          >
            {t('export')}
          </Button>
          <label>
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              disabled={disabled || importing}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importFile(file)
              }}
            />
            <span
              className={`border-border bg-background inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium ${
                disabled || importing
                  ? 'pointer-events-none opacity-50'
                  : 'hover:bg-muted cursor-pointer'
              }`}
            >
              {importing ? t('importing') : t('import')}
            </span>
          </label>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          {t('csvHint', { count: total })}
        </p>
        {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="border-border mt-3 overflow-x-auto rounded-md border">
          {contacts.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              {t('empty')}
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  {audience === 'selected' && <th className="p-2" />}
                  <th className="p-2 font-medium">{t('address')}</th>
                  <th className="p-2 font-medium">{t('status')}</th>
                  <th className="p-2 font-medium">{t('source')}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-t">
                    {audience === 'selected' && (
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(contact.id)}
                          disabled={disabled || contact.status !== 'active' || running}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(contact.id)
                                ? current.filter((id) => id !== contact.id)
                                : [...current, contact.id],
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="p-2">
                      <p className="font-medium">{contact.email}</p>
                      {contact.full_name && (
                        <p className="text-muted-foreground">{contact.full_name}</p>
                      )}
                      <ContactTagPicker
                        tags={tags}
                        tagIds={contact.tagIds}
                        disabled={disabled}
                        onToggle={(tagId, assigned) => {
                          void setContactTag({
                            kind: 'email',
                            contactId: contact.id,
                            tagId,
                            assigned,
                          }).then(() => {
                            setContacts((current) =>
                              current.map((item) =>
                                item.id === contact.id
                                  ? {
                                      ...item,
                                      tagIds: assigned
                                        ? [...item.tagIds, tagId]
                                        : item.tagIds.filter((id) => id !== tagId),
                                    }
                                  : item,
                              ),
                            )
                          })
                        }}
                      />
                    </td>
                    <td className="p-2">{t(contact.status)}</td>
                    <td className="p-2">
                      {contact.source === 'import'
                        ? t('sourceImport')
                        : t('sourceRegistration')}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-2">
                        {contact.status === 'active' ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={disabled || busyId === contact.id}
                            onClick={() => void changeStatus(contact, 'blocked')}
                          >
                            {t('block')}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={disabled || busyId === contact.id}
                            onClick={() => void changeStatus(contact, 'active')}
                          >
                            {t('allow')}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || busyId === contact.id}
                          onClick={() => void remove(contact)}
                        >
                          {t('delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('previous')}
          </Button>
          <span className="text-muted-foreground text-xs">
            {page + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('next')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
