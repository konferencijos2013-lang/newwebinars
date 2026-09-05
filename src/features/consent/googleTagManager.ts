import {
  CONSENT_CHANGED_EVENT,
  getConsentPreferences,
  type ConsentPreferences,
} from './consent'

type GoogleConsentState = 'granted' | 'denied'
type DataLayerValue = unknown[] | Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: DataLayerValue[]
  }
}

const GTM_SCRIPT_ID = 'newwebinars-google-tag-manager'
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/i

function gtag(
  ...args: [
    command: 'consent',
    action: 'default' | 'update',
    parameters: Record<string, unknown>,
  ]
) {
  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push(args)
}

function updateGoogleConsent(analytics: boolean, marketing: boolean) {
  const analyticsState: GoogleConsentState = analytics ? 'granted' : 'denied'
  const marketingState: GoogleConsentState = marketing ? 'granted' : 'denied'

  gtag('consent', 'update', {
    analytics_storage: analyticsState,
    ad_storage: marketingState,
    ad_user_data: marketingState,
    ad_personalization: marketingState,
  })
}

function loadGoogleTagManager(containerId: string) {
  if (document.getElementById(GTM_SCRIPT_ID)) return

  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })

  const script = document.createElement('script')
  script.id = GTM_SCRIPT_ID
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`
  document.head.appendChild(script)
}

export function initializeGoogleTagManager() {
  const containerId = import.meta.env.VITE_GTM_ID?.trim()

  window.dataLayer = window.dataLayer ?? []
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  })

  const applyPreferences = (preferences: ConsentPreferences | null) => {
    const analytics = preferences?.analytics === true
    const marketing = preferences?.marketing === true
    updateGoogleConsent(analytics, marketing)

    if (
      (analytics || marketing) &&
      containerId &&
      GTM_ID_PATTERN.test(containerId)
    ) {
      loadGoogleTagManager(containerId)
    }
  }

  applyPreferences(getConsentPreferences())

  window.addEventListener(CONSENT_CHANGED_EVENT, (event) => {
    const preferences = (event as CustomEvent<ConsentPreferences>).detail
    applyPreferences(preferences)
  })
}
