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
export const CONSENT_CHANGED_EVENT = 'newwebinars:consent-changed'
export const PARTNER_VISITOR_TOKEN_KEY = 'newwebinars_partner_visitor_token'
const ANALYTICS_STORAGE_PREFIX = 'newwebinars_analytics_'

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
  if (!value.marketing) {
    localStorage.removeItem(PARTNER_VISITOR_TOKEN_KEY)
  }
  if (!value.analytics) {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith(ANALYTICS_STORAGE_PREFIX))
        localStorage.removeItem(key)
    }
  }
  window.dispatchEvent(
    new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }),
  )
  return value
}

export function hasMarketingConsent() {
  return getConsentPreferences()?.marketing === true
}

export function hasAnalyticsConsent() {
  return getConsentPreferences()?.analytics === true
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
