import { useState } from 'react'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { submitPartnerApplication, type PartnerPayoutMethod } from '@/features/affiliate/api/applications'

const inputClass = 'border-input bg-background h-10 w-full rounded-md border px-3 text-sm'

export function PartnersPage() {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<PartnerPayoutMethod>('bank')
  const [form, setForm] = useState({ name: '', email: '', phone: '', bankAccountHolder: '', bankIban: '', paypalEmail: '', terms: false })
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const apply = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.terms) { setError('Privalote sutikti su partnerių programos sąlygomis.'); return }
    setStatus('sending'); setError('')
    try {
      await submitPartnerApplication({ ...form, payoutMethod: method })
      setStatus('success')
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : 'Nepavyko pateikti paraiškos.')
    }
  }

  return <div className="mx-auto max-w-4xl px-4 py-16 text-center">
    <h1 className="text-foreground text-4xl font-bold tracking-tight">Partner with NewWebinars</h1>
    <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">Earn 30% commission for the first 12 months by referring customers</p>
    <Card className="mt-12 p-8">
      <CardTitle>30% recurring commission</CardTitle>
      <CardDescription className="mt-2">For every customer you refer, earn commission on their payments for the first 12 months.</CardDescription>
      {!open ? <Button className="mt-6" onClick={() => setOpen(true)}>Become a partner</Button> : null}
      {open && status !== 'success' ? <form onSubmit={apply} className="mt-8 grid gap-4 text-left md:grid-cols-2">
        <Field label="Vardas, pavardė arba įmonės pavadinimas"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
        <Field label="El. paštas"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Telefono numeris"><input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} /></Field>
        <Field label="Išmokėjimo būdas"><select value={method} onChange={(e) => setMethod(e.target.value as PartnerPayoutMethod)} className={inputClass}><option value="bank">Banko pavedimas</option><option value="paypal">PayPal</option></select></Field>
        {method === 'bank' ? <><Field label="Sąskaitos gavėjas"><input required value={form.bankAccountHolder} onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })} className={inputClass} /></Field><Field label="IBAN"><input required value={form.bankIban} onChange={(e) => setForm({ ...form, bankIban: e.target.value })} className={inputClass} /></Field></> : <Field label="PayPal el. paštas"><input required type="email" value={form.paypalEmail} onChange={(e) => setForm({ ...form, paypalEmail: e.target.value })} className={inputClass} /></Field>}
        <label className="md:col-span-2 flex items-start gap-2 text-sm leading-5"><input required checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} type="checkbox" className="mt-1" /><span>Sutinku su <a className="text-primary underline" href="#partneriu-salygos">Partnerių programos sąlygomis</a>, įskaitant draudimą siųsti spamą, naudoti botus, klaidinančią ar kitą „pilkąją“ reklamą.</span></label>
        {error ? <p className="text-destructive text-sm md:col-span-2">{error}</p> : null}
        <div className="md:col-span-2"><Button type="submit" isLoading={status === 'sending'}>Pateikti paraišką</Button></div>
      </form> : null}
      {status === 'success' ? <p className="mt-8 rounded-md bg-muted p-4 text-sm">Ačiū, paraiška gauta. Ją peržiūrėsime ir susisieksime el. paštu. Partnerio nuoroda bus aktyvi tik po patvirtinimo.</p> : null}
    </Card>
    <section id="partneriu-salygos" className="mt-10 rounded-lg border p-6 text-left text-sm leading-6"><h2 className="text-lg font-semibold">Partnerių programos sąlygos</h2><p className="mt-3">Partneris gali reklamuoti NewWebinars tik sąžiningais, teisėtais ir skaidriais būdais. Draudžiama siųsti nepageidaujamus laiškus ar žinutes, naudoti botus, netikrą srautą, klaidinančią reklamą, apsimesti NewWebinars vardu ar žadėti neegzistuojamas nuolaidas.</p><p className="mt-2">Pažeidus šias sąlygas paraiška arba partnerio paskyra gali būti atmesta ar užblokuota, o neišmokėti komisiniai anuliuoti tiek, kiek leidžia taikytina teisė ir programos sąlygos.</p></section>
  </div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label> }
