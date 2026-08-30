import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ArrowRight, BadgeEuro, CheckCircle2, Link2, Users } from 'lucide-react'
import {
  submitPartnerApplication,
  type PartnerPayoutMethod,
} from '@/features/affiliate/api/applications'

const inputClass =
  'border-input bg-background h-12 w-full rounded-xl border px-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10'

export function PartnersPage() {
  const { t } = useTranslation('landing')
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<PartnerPayoutMethod>('bank')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    bankAccountHolder: '',
    bankIban: '',
    paypalEmail: '',
    terms: false,
  })
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'success' | 'error'
  >('idle')
  const [error, setError] = useState('')

  const apply = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.terms) {
      setError(t('partners.termsRequired'))
      return
    }
    setStatus('sending')
    setError('')
    try {
      await submitPartnerApplication({ ...form, payoutMethod: method })
      setStatus('success')
    } catch (reason) {
      setStatus('error')
      setError(
        reason instanceof Error
          ? reason.message
          : t('partners.applicationFailed'),
      )
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(circle_at_25%_10%,color-mix(in_srgb,var(--color-primary)_18%,transparent),transparent_58%)]" />
      <section className="mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <span className="border-primary/20 bg-primary/5 text-primary inline-flex rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase">
              {t('partners.eyebrow')}
            </span>
            <h1 className="mt-6 text-5xl font-bold tracking-[-0.05em] sm:text-6xl">
              {t('partners.title')}
            </h1>
            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
              {t('partners.subtitle')}
            </p>
            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: BadgeEuro,
                  text: `30 % ${t('partners.statCommission')}`,
                },
                { icon: Link2, text: `1 ${t('partners.statLink')}` },
                { icon: Users, text: `12 ${t('partners.statPeriod')}` },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="bg-card rounded-2xl border p-4 shadow-sm"
                >
                  <Icon className="text-primary h-5 w-5" />
                  <div className="mt-3 text-lg font-bold">{text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative rounded-[2rem] bg-[#111326] p-8 text-white shadow-2xl sm:p-10">
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-violet-500/30 blur-3xl" />
            <BadgeEuro className="h-10 w-10 text-violet-300" />
            <h2 className="mt-7 text-3xl font-bold">
              {t('partners.commissionTitle')}
            </h2>
            <p className="mt-4 leading-7 text-white/60">
              {t('partners.commissionDescription')}
            </p>
            {!open ? (
              <Button
                className="mt-8 h-12 rounded-full bg-white px-7 text-[#111326] hover:bg-white/90"
                onClick={() => setOpen(true)}
              >
                {t('partners.cta')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="mt-8 flex items-center gap-2 text-sm text-violet-200">
                <CheckCircle2 className="h-5 w-5" />
                {t('partners.formHint')}
              </div>
            )}
          </div>
        </div>

        {open && status !== 'success' ? (
          <form
            onSubmit={apply}
            className="bg-card mx-auto mt-16 grid max-w-4xl gap-5 rounded-[2rem] border p-6 text-left shadow-xl sm:p-10 md:grid-cols-2"
          >
            <div className="mb-2 md:col-span-2">
              <h2 className="text-2xl font-bold">{t('partners.cta')}</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('partners.commissionDescription')}
              </p>
            </div>
            <Field label={t('partners.formName')}>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={t('partners.formEmail')}>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={t('partners.formPhone')}>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={t('partners.formPayoutMethod')}>
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as PartnerPayoutMethod)
                }
                className={inputClass}
              >
                <option value="bank">{t('partners.bankTransfer')}</option>
                <option value="paypal">PayPal</option>
              </select>
            </Field>
            {method === 'bank' ? (
              <>
                <Field label={t('partners.bankAccountHolder')}>
                  <input
                    required
                    value={form.bankAccountHolder}
                    onChange={(e) =>
                      setForm({ ...form, bankAccountHolder: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="IBAN">
                  <input
                    required
                    value={form.bankIban}
                    onChange={(e) =>
                      setForm({ ...form, bankIban: e.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <Field label={t('partners.paypalEmail')}>
                <input
                  required
                  type="email"
                  value={form.paypalEmail}
                  onChange={(e) =>
                    setForm({ ...form, paypalEmail: e.target.value })
                  }
                  className={inputClass}
                />
              </Field>
            )}
            <label className="bg-muted/60 flex items-start gap-3 rounded-xl p-4 text-sm leading-6 md:col-span-2">
              <input
                required
                checked={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.checked })}
                type="checkbox"
                className="mt-1"
              />
              <span>
                {t('partners.termsConsentBefore')}
                <a
                  className="text-primary font-medium underline"
                  href="#partneriu-salygos"
                >
                  {t('partners.termsLink')}
                </a>
                {t('partners.termsConsentAfter')}
              </span>
            </label>
            {error ? (
              <p className="text-destructive text-sm md:col-span-2">{error}</p>
            ) : null}
            <div className="md:col-span-2">
              <Button
                className="h-12 rounded-full px-7"
                type="submit"
                isLoading={status === 'sending'}
              >
                {t('partners.submitApplication')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        ) : null}
        {status === 'success' ? (
          <div className="mx-auto mt-16 flex max-w-2xl items-start gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-left">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
            <p>{t('partners.applicationSuccess')}</p>
          </div>
        ) : null}
        <section
          id="partneriu-salygos"
          className="bg-card/70 mx-auto mt-16 max-w-4xl rounded-3xl border p-7 text-left text-sm leading-7 sm:p-10"
        >
          <h2 className="text-xl font-bold">{t('partners.termsTitle')}</h2>
          <p className="text-muted-foreground mt-4">
            {t('partners.termsBody1')}
          </p>
          <p className="text-muted-foreground mt-3">
            {t('partners.termsBody2')}
          </p>
        </section>
      </section>
    </div>
  )
}
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
