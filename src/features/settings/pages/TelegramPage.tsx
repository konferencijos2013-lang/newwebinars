import { Send } from 'lucide-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { TelegramForm } from '@/features/settings/pages/IntegrationsPage'
import { fetchIntegrationConnections } from '@/features/settings/api/integrations'
import { useEffect, useState } from 'react'
import type { IntegrationConnection } from '@/features/settings/api/integrations'

export function TelegramPage() {
  const accountState = useAccount()
  const [connection, setConnection] = useState<IntegrationConnection | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (accountState.status !== 'ready') return
    let active = true
    void fetchIntegrationConnections(accountState.account.id)
      .then((items) => {
        if (active)
          setConnection(
            items.find((item) => item.provider === 'telegram') ?? null,
          )
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
  }, [accountState])

  if (accountState.status === 'loading' || loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )

  if (accountState.status !== 'ready')
    return (
      <Card className="mx-auto max-w-3xl text-center">
        <Send className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
        <CardTitle>Telegram nepasiekiamas</CardTitle>
        <CardDescription className="mt-2">
          Prisijunkite prie paskyros.
        </CardDescription>
      </Card>
    )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Telegram
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Valdykite botą ir DI atsakymus, siųskite arba iš anksto suplanuokite
          žinutes bei stebėkite siuntimų rezultatus.
        </p>
      </div>
      {error && (
        <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <TelegramForm
        connection={connection}
        disabled={!['owner', 'admin'].includes(accountState.membership.role)}
        accountId={accountState.account.id}
      />
    </div>
  )
}
