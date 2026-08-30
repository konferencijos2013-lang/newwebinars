import { useTranslation } from 'react-i18next'
import { Cookie, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openConsentSettings } from '@/features/consent/consent'

export function CookiePolicyPage() {
  const { t } = useTranslation('common')
  const sections = [
    'what',
    'necessary',
    'analytics',
    'marketing',
    'choices',
  ] as const
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
          <Cookie className="h-3.5 w-3.5" /> {t('cookiePolicy.eyebrow')}
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          {t('cookiePolicy.title')}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg leading-8">
          {t('cookiePolicy.intro')}
        </p>
        <div className="mt-10 space-y-5">
          {sections.map((section) => (
            <article
              key={section}
              className="bg-card rounded-2xl border p-6 shadow-sm"
            >
              <h2 className="text-lg font-bold">
                {t(`cookiePolicy.sections.${section}.title`)}
              </h2>
              <p className="text-muted-foreground mt-2 leading-7">
                {t(`cookiePolicy.sections.${section}.description`)}
              </p>
            </article>
          ))}
        </div>
        <Button className="mt-8 h-11 rounded-xl" onClick={openConsentSettings}>
          <ShieldCheck className="h-4 w-4" />{' '}
          {t('cookieConsent.changeSettings')}
        </Button>
      </div>
    </section>
  )
}
