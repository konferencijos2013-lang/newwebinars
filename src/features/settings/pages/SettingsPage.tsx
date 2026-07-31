import { useState } from 'react'
import { Check, Copy, Globe, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useAccount } from '@/features/auth/hooks/useAccount'
import { updateAccountDomains } from '@/features/settings/api/domains'

const subdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const hostnamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

export function SettingsPage() {
  const accountState = useAccount()

  if (accountState.status === 'loading') {
    return <div className="flex h-64 items-center justify-center"><Spinner className="h-8 w-8" /></div>
  }

  if (accountState.status !== 'ready') {
    return (
      <div className="mx-auto max-w-3xl"><Card className="flex flex-col items-center justify-center py-16 text-center"><Settings className="text-muted-foreground mb-4 h-12 w-12" /><CardTitle>Settings unavailable</CardTitle><CardDescription className="mt-2">Sign in to configure your webinar links.</CardDescription></Card></div>
    )
  }

  return (
    <DomainSettingsForm
      key={accountState.account.id}
      account={accountState.account}
      membership={accountState.membership}
    />
  )
}

function DomainSettingsForm({
  account,
  membership,
}: {
  account: import('@/shared/database.types').Account
  membership: import('@/shared/database.types').AccountMember
}) {
  const [publicSubdomain, setPublicSubdomain] = useState(account.public_subdomain ?? '')
  const [customDomain, setCustomDomain] = useState(account.custom_domain ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = membership.role === 'owner' || membership.role === 'admin'
  const managedHost = publicSubdomain ? `${publicSubdomain}.newwebinars.com` : ''

  async function saveManagedSubdomain() {
    const normalized = publicSubdomain.trim().toLowerCase()
    setError(null)
    setMessage(null)
    if (!normalized || !subdomainPattern.test(normalized)) {
      setError('Use 1–63 lowercase letters, numbers, or hyphens. The name cannot start or end with a hyphen.')
      return
    }
    setSaving(true)
    try {
      const updated = await updateAccountDomains(account.id, { public_subdomain: normalized })
      setPublicSubdomain(updated.public_subdomain ?? '')
      setMessage(`Saved: https://${updated.public_subdomain}.newwebinars.com/verslo-augimas`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setSaving(false) }
  }

  async function saveCustomDomain() {
    const normalized = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    setError(null)
    setMessage(null)
    if (!normalized || !hostnamePattern.test(normalized) || !normalized.includes('.')) {
      setError('Enter a valid hostname, for example webinar.jusu-imone.lt (without https://).')
      return
    }
    setSaving(true)
    try {
      const updated = await updateAccountDomains(account.id, {
        custom_domain: normalized,
        custom_domain_status: 'pending_dns',
      })
      setCustomDomain(updated.custom_domain ?? '')
      setMessage('Custom domain saved as pending. The exact CNAME target must be configured in Cloudflare Pages before DNS verification can start.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setSaving(false) }
  }

  function copy(value: string) { void navigator.clipboard.writeText(value); setMessage('Copied to clipboard.') }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-foreground text-2xl font-bold tracking-tight">Public webinar domains</h1><p className="text-muted-foreground mt-1 text-sm">Every webinar keeps a short path, for example <span className="font-medium">/verslo-augimas</span>.</p></div>
      {!canManage && <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Only the account owner or an administrator can change domain settings.</p>}
      {error && <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {message && <p className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">{message}</p>}
      <Card>
        <div className="flex items-start gap-3"><Globe className="text-primary mt-0.5 h-5 w-5" /><div><CardTitle className="text-base">NewWebinars subdomain</CardTitle><CardDescription className="mt-1">Use your managed address first, such as <strong>mano-imone.newwebinars.com/verslo-augimas</strong>.</CardDescription></div></div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><div className="flex min-w-0 flex-1 items-center"><Input disabled={!canManage || saving} value={publicSubdomain} onChange={(event) => setPublicSubdomain(event.target.value.toLowerCase())} placeholder="mano-imone" className="rounded-r-none" /><span className="border-border bg-muted text-muted-foreground flex h-9 shrink-0 items-center rounded-r-md border border-l-0 px-3 text-sm">.newwebinars.com</span></div><Button disabled={!canManage} isLoading={saving} onClick={() => void saveManagedSubdomain()}>Save</Button></div>
        {managedHost && <p className="text-muted-foreground mt-3 text-sm">Webinar address: <span className="text-foreground font-medium">https://{managedHost}/verslo-augimas</span></p>}
      </Card>
      <Card>
        <CardTitle className="text-base">Your own subdomain (CNAME)</CardTitle><CardDescription className="mt-1">Connect a subdomain you own, such as <strong>webinar.jusu-imone.lt</strong>. Root domains cannot use CNAME; use a subdomain.</CardDescription>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Input disabled={!canManage || saving} value={customDomain} onChange={(event) => setCustomDomain(event.target.value.toLowerCase())} placeholder="webinar.jusu-imone.lt" /><Button disabled={!canManage} isLoading={saving} onClick={() => void saveCustomDomain()}>Connect domain</Button></div>
        {customDomain && <div className="border-border bg-muted/40 mt-5 rounded-md border p-4 text-sm"><p className="font-medium">Connection status</p><p className="text-muted-foreground mt-2">Status: <span className="font-medium capitalize">{account.custom_domain_status.replace('_', ' ')}</span>. Before verification, an administrator must add this hostname to the Cloudflare Pages project and enter Cloudflare’s returned CNAME target in your DNS provider.</p><div className="mt-3 flex items-center gap-2"><span className="text-muted-foreground">Hostname:</span><span className="break-all font-medium">{customDomain}</span><Button variant="ghost" size="sm" aria-label="Copy domain name" onClick={() => copy(customDomain)}><Copy className="h-4 w-4" /></Button></div><p className="text-muted-foreground mt-4">Once verified, this webinar will be available at <strong>https://{customDomain}/verslo-augimas</strong>.</p></div>}
      </Card>
      <Card className="bg-muted/30"><div className="flex gap-3"><Check className="mt-0.5 h-5 w-5 text-green-600" /><div><CardTitle className="text-base">How webinar links work</CardTitle><CardDescription className="mt-1">The hostname identifies your account; the short path identifies the webinar. The same webinar can be shared as <strong>mano-imone.newwebinars.com/verslo-augimas</strong> now, then as <strong>webinar.jusu-imone.lt/verslo-augimas</strong> after DNS verification.</CardDescription></div></div></Card>
    </div>
  )
}
