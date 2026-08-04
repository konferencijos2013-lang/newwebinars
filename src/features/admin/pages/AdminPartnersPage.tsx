import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { fetchAdminPartners, type AdminPartnerRow } from '@/features/admin/api/admin'

const money = new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' })

export function AdminPartnersPage() {
  const [partners, setPartners] = useState<AdminPartnerRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => { fetchAdminPartners().then((rows) => { setPartners(rows); setStatus('ready') }).catch(() => setStatus('error')) }, [])
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-primary text-sm font-semibold">Platformos valdymas</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Partneriai</h1><p className="text-muted-foreground mt-2 text-sm">Prenumeratų priskyrimas, komisiniai ir išmokos.</p></div><Link to="/admin/partners/new"><Button><Plus className="h-4 w-4" /> Naujas partneris</Button></Link></div>
    {status === 'loading' ? <div className="flex h-48 items-center justify-center"><Spinner className="h-8 w-8" /></div> : null}
    {status === 'error' ? <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 text-sm">Nepavyko įkelti partnerių.</div> : null}
    {status === 'ready' ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/50 text-muted-foreground text-left"><tr><th className="p-3">Partneris</th><th className="p-3">Būsena</th><th className="p-3">Nuoroda</th><th className="p-3">Paspaudimai</th><th className="p-3">Atvesti klientai</th><th className="p-3">Aktyvios pren.</th><th className="p-3">Sukaupta</th><th className="p-3">Mokėtina</th><th className="p-3" /></tr></thead><tbody>{partners.map((partner) => <tr key={partner.id} className="border-t"><td className="p-3"><p className="font-medium">{partner.name}</p><p className="text-muted-foreground text-xs">{partner.email ?? '—'} · {partner.commission_rate_bps / 100}% / {partner.commission_months} mėn.</p></td><td className="p-3"><span className="bg-muted rounded px-2 py-1 text-xs">{partner.application_status === 'pending' ? 'Laukia patvirtinimo' : partner.application_status === 'approved' && partner.is_active ? 'Aktyvus' : partner.application_status === 'blocked' ? 'Užblokuotas' : 'Neaktyvus'}</span></td><td className="p-3 font-mono text-xs">/r/{partner.code}</td><td className="p-3">{partner.clicks_count}</td><td className="p-3">{partner.referred_accounts_count}</td><td className="p-3">{partner.active_subscriptions_count}</td><td className="p-3">{money.format(partner.accrued_cents / 100)}</td><td className="p-3 font-medium">{money.format(partner.payable_cents / 100)}</td><td className="p-3 text-right"><Link className="text-primary font-medium hover:underline" to={`/admin/partners/${partner.id}`}>Atidaryti</Link></td></tr>)}</tbody></table>{partners.length === 0 ? <p className="text-muted-foreground p-6 text-sm">Partnerių dar nėra.</p> : null}</div> : null}
  </div>
}
