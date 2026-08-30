import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cookie, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import {
  CONSENT_OPEN_EVENT,
  getConsentPreferences,
  saveConsentPreferences,
} from './consent'

type Preferences = { analytics: boolean; marketing: boolean }
const defaults: Preferences = { analytics: false, marketing: false }

function initialConsentState() {
  const saved = getConsentPreferences()
  return {
    visible: !saved,
    preferences: saved
      ? { analytics: saved.analytics, marketing: saved.marketing }
      : defaults,
  }
}

export function CookieConsent() {
  const { t } = useTranslation('common')
  const [initial] = useState(initialConsentState)
  const [visible, setVisible] = useState(initial.visible)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(
    initial.preferences,
  )

  useEffect(() => {
    const open = () => {
      const current = getConsentPreferences()
      setPreferences(
        current
          ? { analytics: current.analytics, marketing: current.marketing }
          : defaults,
      )
      setSettingsOpen(true)
      setVisible(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, open)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open)
  }, [])

  const commit = (value: Preferences) => {
    saveConsentPreferences(value)
    setPreferences(value)
    setSettingsOpen(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-5"
      role="region"
      aria-label={t('cookieConsent.title')}
    >
      <div className="bg-card/95 border-border/80 mx-auto max-w-5xl overflow-hidden rounded-2xl border shadow-[0_24px_80px_-20px_rgba(20,18,50,0.5)] backdrop-blur-xl">
        <div className="flex gap-4 p-5 sm:p-6">
          <span className="bg-primary/10 text-primary hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex">
            <Cookie className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold tracking-tight">
                  {t('cookieConsent.title')}
                </h2>
                <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                  {t('cookieConsent.description')}{' '}
                  <Link
                    className="text-primary font-medium underline underline-offset-4"
                    to="/cookie-policy"
                  >
                    {t('cookieConsent.policyLink')}
                  </Link>
                </p>
              </div>
              {getConsentPreferences() && (
                <button
                  className="text-muted-foreground hover:text-foreground rounded-lg p-1"
                  onClick={() => setVisible(false)}
                  aria-label={t('close')}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {settingsOpen && (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ConsentOption
                  title={t('cookieConsent.necessary.title')}
                  description={t('cookieConsent.necessary.description')}
                  checked
                  disabled
                  onChange={() => {}}
                />
                <ConsentOption
                  title={t('cookieConsent.analytics.title')}
                  description={t('cookieConsent.analytics.description')}
                  checked={preferences.analytics}
                  onChange={(checked) =>
                    setPreferences((value) => ({
                      ...value,
                      analytics: checked,
                    }))
                  }
                />
                <ConsentOption
                  title={t('cookieConsent.marketing.title')}
                  description={t('cookieConsent.marketing.description')}
                  checked={preferences.marketing}
                  onChange={(checked) =>
                    setPreferences((value) => ({
                      ...value,
                      marketing: checked,
                    }))
                  }
                />
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {!settingsOpen && (
                <Button
                  variant="ghost"
                  className="h-10 rounded-xl"
                  onClick={() => setSettingsOpen(true)}
                >
                  <SlidersHorizontal className="h-4 w-4" />{' '}
                  {t('cookieConsent.settings')}
                </Button>
              )}
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => commit(defaults)}
              >
                {t('cookieConsent.rejectOptional')}
              </Button>
              {settingsOpen && (
                <Button
                  className="h-10 rounded-xl"
                  onClick={() => commit(preferences)}
                >
                  <ShieldCheck className="h-4 w-4" />{' '}
                  {t('cookieConsent.savePreferences')}
                </Button>
              )}
              {!settingsOpen && (
                <Button
                  className="h-10 rounded-xl"
                  onClick={() => commit({ analytics: true, marketing: true })}
                >
                  {t('cookieConsent.acceptAll')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConsentOption({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="border-border/70 bg-background/60 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5">
      <input
        type="checkbox"
        className="accent-primary mt-1 h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-1 block text-xs leading-5">
          {description}
        </span>
      </span>
    </label>
  )
}
