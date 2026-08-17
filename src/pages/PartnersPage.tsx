import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  submitPartnerApplication,
  type PartnerPayoutMethod,
} from '@/features/affiliate/api/applications'

const inputClass =
  'border-input bg-background h-10 w-full rounded-md border px-3 text-sm'

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
    <div className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-foreground text-4xl font-bold tracking-tight">
        {t('partners.title')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
        {t('partners.subtitle')}
      </p>
      <Card className="mt-12 p-8">
        <CardTitle>{t('partners.commissionTitle')}</CardTitle>
        <CardDescription className="mt-2">
          {t('partners.commissionDescription')}
        </CardDescription>
        {!open ? (
          <Button className="mt-6" onClick={() => setOpen(true)}>
            {t('partners.cta')}
          </Button>
        ) : null}
        {open && status !== 'success' ? (
          <form
            onSubmit={apply}
            className="mt-8 grid gap-4 text-left md:grid-cols-2"
          >
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
            <label className="flex items-start gap-2 text-sm leading-5 md:col-span-2">
              <input
                required
                checked={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.checked })}
                type="checkbox"
                className="mt-1"
              />
              <span>
                {t('partners.termsConsentBefore')}
                <a className="text-primary underline" href="#partneriu-salygos">
                  {t('partners.termsLink')}
                </a>
                {t('partners.termsConsentAfter')}
              </span>
            </label>
            {error ? (
              <p className="text-destructive text-sm md:col-span-2">{error}</p>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" isLoading={status === 'sending'}>
                {t('partners.submitApplication')}
              </Button>
            </div>
          </form>
        ) : null}
        {status === 'success' ? (
          <p className="bg-muted mt-8 rounded-md p-4 text-sm">
            {t('partners.applicationSuccess')}
          </p>
        ) : null}
      </Card>
      <section
        id="partneriu-salygos"
        className="mt-10 rounded-lg border p-6 text-left text-sm leading-6"
      >
        <h2 className="text-lg font-semibold">{t('partners.termsTitle')}</h2>
        <p className="mt-3">{t('partners.termsBody1')}</p>
        <p className="mt-2">{t('partners.termsBody2')}</p>
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
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
