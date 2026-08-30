export type ConsentPreferences = {
  version: number
  necessary: true
  analytics: boolean
  marketing: boolean
  updatedAt: string
}

export const CONSENT_STORAGE_KEY = 'newwebinars_consent'
export const CONSENT_VERSION = 1
export const CONSENT_OPEN_EVENT = 'newwebinars:open-consent'

export function getConsentPreferences(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ConsentPreferences>
    if (value.version !== CONSENT_VERSION) return null
    return {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: value.analytics === true,
      marketing: value.marketing === true,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    }
  } catch {
    return null
  }
}

export function saveConsentPreferences(
  preferences: Pick<ConsentPreferences, 'analytics' | 'marketing'>,
) {
  const value: ConsentPreferences = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value))
  window.dispatchEvent(
    new CustomEvent('newwebinars:consent-changed', { detail: value }),
  )
  return value
}

export function hasMarketingConsent() {
  return getConsentPreferences()?.marketing === true
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
