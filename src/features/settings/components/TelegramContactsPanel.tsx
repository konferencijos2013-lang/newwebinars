import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import {
  deleteTelegramContact,
  fetchAllTelegramContacts,
  fetchTelegramContacts,
  importTelegramContacts,
  setTelegramContactStatus,
  type TelegramContact,
} from '@/features/settings/api/integrations'
import {
  parseTelegramContactsCsv,
  telegramContactsToCsv,
} from '@/features/settings/telegramContactsCsv'

const PAGE_SIZE = 20

function contactName(contact: TelegramContact) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  return (
    name ||
    (contact.username
      ? `@${contact.username}`
      : `Telegram ID ${contact.telegram_user_id ?? contact.chat_id}`)
  )
}

function statusLabel(status: TelegramContact['status']) {
  if (status === 'blocked') return 'Užblokuotas'
  if (status === 'unsubscribed') return 'Atsisakė'
  return 'Aktyvus'
}

export function TelegramContactsPanel({
  accountId,
  connectionId,
  disabled,
}: {
  accountId: string
  connectionId: string
  disabled: boolean
}) {
  const [contacts, setContacts] = useState<TelegramContact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTelegramContacts({
        accountId,
        connectionId,
        page,
        pageSize: PAGE_SIZE,
        search,
      })
      setContacts(result.contacts)
      setTotal(result.total)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [accountId, connectionId, page, search])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function changeStatus(
    contact: TelegramContact,
    status: 'active' | 'blocked',
  ) {
    setBusyId(contact.id)
    setError(null)
    setNotice(null)
    try {
      await setTelegramContactStatus(contact.id, status)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(contact: TelegramContact) {
    if (!window.confirm(`Ištrinti kontaktą ${contactName(contact)}?`)) return
    setBusyId(contact.id)
    setError(null)
    setNotice(null)
    try {
      await deleteTelegramContact(contact.id)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyId(null)
    }
  }

  async function exportContacts() {
    setExporting(true)
    setError(null)
    try {
      const rows = await fetchAllTelegramContacts(accountId, connectionId)
      const csv = telegramContactsToCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'telegram-kontaktai.csv'
      link.click()
      URL.revokeObjectURL(url)
      setNotice(`Eksportuota kontaktų: ${rows.length}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  async function importFile(file: File) {
    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const rows = parseTelegramContactsCsv(await file.text()).filter((row) =>
        /^-?[0-9]{1,20}$/.test(row.chat_id),
      )
      if (rows.length === 0) {
        setError('CSV faile nėra chat_id. Telegramui reikia skaitinio pokalbio ID.')
        return
      }
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (let index = 0; index < rows.length; index += 1000) {
        const result = await importTelegramContacts(
          connectionId,
          rows.slice(index, index + 1000),
        )
        inserted += result.inserted
        updated += result.updated
        skipped += result.skipped
      }
      setNotice(
        `Importuota naujų: ${inserted}. Atnaujinta: ${updated}. Praleista: ${skipped}.`,
      )
      setPage(0)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardTitle>Boto kontaktai</CardTitle>
      <CardDescription className="mt-1">
        Čia kaupiami žmonės, kurie parašė botui arba užsiregistravo per jį.
        Žinutę galima išsiųsti tik tam, kas yra atidaręs šį botą. Užblokuotas
        kontaktas nebegaus pranešimų ir botas jam nebeatsakys.
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
            placeholder="Ieškoti pagal vardą, @username ar Telegram ID"
          />
          <Button type="submit" variant="outline">
            Ieškoti
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || exporting || total === 0}
          isLoading={exporting}
          onClick={() => void exportContacts()}
        >
          Eksportuoti
        </Button>
        <label className="inline-flex">
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
            {importing ? 'Importuojama…' : 'Importuoti CSV'}
          </span>
        </label>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        CSV stulpeliai: chat_id, telegram_user_id, username, first_name,
        last_name. Užtenka ir vieno stulpelio su chat_id. Iš viso: {total}.
      </p>
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="border-border mt-3 overflow-x-auto rounded-md border">
        {loading ? (
          <div className="flex h-28 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Kontaktų dar nėra. Jie atsiras, kai žmogus parašys botui.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Kontaktas</th>
                <th className="p-2 font-medium">Chat ID</th>
                <th className="p-2 font-medium">Būsena</th>
                <th className="p-2 font-medium">Paskutinį kartą</th>
                <th className="p-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-t">
                  <td className="p-2">
                    <p className="font-medium">{contactName(contact)}</p>
                    {contact.username && (
                      <p className="text-muted-foreground">@{contact.username}</p>
                    )}
                  </td>
                  <td className="p-2">{contact.chat_id}</td>
                  <td className="p-2">{statusLabel(contact.status)}</td>
                  <td className="p-2">
                    {new Date(contact.last_seen_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      {contact.status === 'blocked' ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || busyId === contact.id}
                          onClick={() => void changeStatus(contact, 'active')}
                        >
                          Atblokuoti
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled || busyId === contact.id}
                          onClick={() => void changeStatus(contact, 'blocked')}
                        >
                          Užblokuoti
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || busyId === contact.id}
                        onClick={() => void remove(contact)}
                      >
                        Ištrinti
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
          disabled={page === 0 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          Ankstesnis
        </Button>
        <span className="text-muted-foreground text-xs">
          {page + 1} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page + 1 >= pageCount || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Kitas
        </Button>
      </div>
    </Card>
  )
}
