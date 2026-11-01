import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import {
  fetchAccountPaymentProvider,
  selectAccountPaymentProvider,
  type IntegrationConnection,
  type OfferPaymentProvider,
} from '@/features/settings/api/integrations'

const providers: { id: OfferPaymentProvider; label: string; hint: string }[] = [
  {
    id: 'paysera',
    label: 'Paysera',
    hint: 'Lietuvos interneto bankai, kortelė ir mokėjimai iš kitų šalių.',
  },
  {
    id: 'stripe',
    label: 'Stripe',
    hint: 'Kortelė per jūsų Stripe paskyrą. Pinigai keliauja jums, ne į NewWebinars.',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    hint: 'PayPal sąskaita arba kortelė.',
  },
]

export function PaymentProviderCard({
  accountId,
  connections,
  disabled,
  onSave,
  onChanged,
}: {
  accountId: string
  connections: IntegrationConnection[]
  disabled: boolean
  onSave: (input: {
    provider: OfferPaymentProvider
    displayName: string
    credential: string
    config: Record<string, unknown>
  }) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const saved = (provider: OfferPaymentProvider) =>
    connections.some(
      (item) => item.provider === provider && item.status === 'active',
    )
  const [selected, setSelected] = useState<OfferPaymentProvider>('paysera')
  const [active, setActive] = useState<OfferPaymentProvider | null>(null)
  const [projectId, setProjectId] = useState('')
  const [payseraTest, setPayseraTest] = useState(false)
  const [signPassword, setSignPassword] = useState('')
  const [stripeKey, setStripeKey] = useState('')
  const [paypalClientId, setPaypalClientId] = useState('')
  const [paypalSecret, setPaypalSecret] = useState('')
  const [paypalSandbox, setPaypalSandbox] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchAccountPaymentProvider(accountId)
      .then((provider) => {
        if (!active || !provider) return
        setActive(provider)
        setSelected(provider)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [accountId])

  async function choose(provider: OfferPaymentProvider) {
    setWorking(true)
    setError(null)
    try {
      await selectAccountPaymentProvider(accountId, provider)
      setActive(provider)
      await onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWorking(false)
    }
  }

  async function saveSelected() {
    setWorking(true)
    setError(null)
    try {
      if (selected === 'paysera') {
        if (!/^\d+$/.test(projectId.trim()) || signPassword.trim().length < 8) {
          throw new Error('Įrašykite Paysera projekto ID ir slaptažodį.')
        }
        await onSave({
          provider: 'paysera',
          displayName: 'Paysera',
          credential: signPassword.trim(),
          config: { project_id: projectId.trim(), test: payseraTest },
        })
        setSignPassword('')
      } else if (selected === 'stripe') {
        if (!stripeKey.trim().startsWith('sk_')) {
          throw new Error('Stripe raktas prasideda sk_.')
        }
        await onSave({
          provider: 'stripe',
          displayName: 'Stripe',
          credential: stripeKey.trim(),
          config: {},
        })
        setStripeKey('')
      } else {
        if (!paypalClientId.trim() || paypalSecret.trim().length < 8) {
          throw new Error('Įrašykite PayPal Client ID ir Secret.')
        }
        await onSave({
          provider: 'paypal',
          displayName: 'PayPal',
          credential: paypalSecret.trim(),
          config: { client_id: paypalClientId.trim(), sandbox: paypalSandbox },
        })
        setPaypalSecret('')
      }
      await choose(selected)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setWorking(false)
    }
  }

  return (
    <Card>
      <CardTitle className="text-base">Pasiūlymo apmokėjimas</CardTitle>
      <CardDescription className="mt-1">
        Pasirinkite, kuo dalyvis moka vebinaro pabaigoje. Vienu metu veikia
        vienas būdas. Raktai po išsaugojimo daugiau nerodomi.
      </CardDescription>
      <p className="mt-3 text-sm">
        {active
          ? `Dabar naudojama: ${providers.find((item) => item.id === active)?.label}`
          : 'Dar nepasirinkta. Pasiūlymo mygtukas atidarys tik nuorodą.'}
      </p>
      <div className="mt-4 grid gap-2">
        {providers.map((provider) => (
          <label key={provider.id} className="flex items-start gap-3 text-sm">
            <input
              type="radio"
              name="offer-payment-provider"
              className="mt-1"
              checked={selected === provider.id}
              onChange={() => setSelected(provider.id)}
              disabled={disabled || working}
            />
            <span>
              <span className="font-medium">{provider.label}</span>
              {saved(provider.id) ? ' · įrašyta' : ''}
              <span className="text-muted-foreground block">
                {provider.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
      {selected === 'paysera' ? (
        <div className="mt-4 grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="paysera-project">Paysera projekto ID</Label>
            <Input
              id="paysera-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={disabled || working}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paysera-password">Projekto slaptažodis</Label>
            <Input
              id="paysera-password"
              type="password"
              value={signPassword}
              onChange={(event) => setSignPassword(event.target.value)}
              disabled={disabled || working}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={payseraTest}
              onChange={(event) => setPayseraTest(event.target.checked)}
              disabled={disabled || working}
            />
            Testinis Paysera režimas
          </label>
        </div>
      ) : null}
      {selected === 'stripe' ? (
        <div className="mt-4 space-y-2">
          <Label htmlFor="stripe-secret">Stripe slaptasis raktas</Label>
          <Input
            id="stripe-secret"
            type="password"
            placeholder="sk_live_..."
            value={stripeKey}
            onChange={(event) => setStripeKey(event.target.value)}
            disabled={disabled || working}
          />
        </div>
      ) : null}
      {selected === 'paypal' ? (
        <div className="mt-4 grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="paypal-client">PayPal Client ID</Label>
            <Input
              id="paypal-client"
              value={paypalClientId}
              onChange={(event) => setPaypalClientId(event.target.value)}
              disabled={disabled || working}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paypal-secret">PayPal Secret</Label>
            <Input
              id="paypal-secret"
              type="password"
              value={paypalSecret}
              onChange={(event) => setPaypalSecret(event.target.value)}
              disabled={disabled || working}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={paypalSandbox}
              onChange={(event) => setPaypalSandbox(event.target.checked)}
              disabled={disabled || working}
            />
            PayPal sandbox
          </label>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={disabled || working}
          isLoading={working}
          onClick={() => void saveSelected()}
        >
          Išsaugoti ir naudoti
        </Button>
        {saved(selected) ? (
          <Button
            variant="outline"
            disabled={disabled || working || active === selected}
            onClick={() => void choose(selected)}
          >
            Naudoti šį būdą
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
