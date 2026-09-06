import { hasAnalyticsConsent } from '@/features/consent/consent'

type AnalyticsEvents = {
  page_view: { page_path: string }
  sign_up: { method: string }
  generate_lead: { lead_type: 'webinar_registration' }
  webinar_registration: {
    registration_method: 'email' | 'telegram'
    registration_source: 'public_webinar' | 'funnel'
  }
  webinar_entry: { webinar_id: string; entry_point: 'waiting_room' }
  webinar_join: { webinar_id: string; room_type: 'attendee' }
  webinar_cta_click: { webinar_id: string; cta_type: 'offer' }
  begin_checkout: {
    currency: string
    value: number
    plan_code: string
    billing_interval: 'month' | 'year'
  }
  purchase: {
    transaction_id: string
    currency: string
    value: number
  }
}

type AnalyticsEventName = keyof AnalyticsEvents
const PURCHASE_STORAGE_PREFIX = 'newwebinars_analytics_purchase_'

/**
 * Pushes an allow-listed, PII-free event only when analytics consent exists.
 * Never pass email addresses, names, tokens, full URLs, or free-form user input.
 */
export function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  event: EventName,
  parameters: AnalyticsEvents[EventName],
) {
  if (!hasAnalyticsConsent()) return false

  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push({ event, ...parameters })
  return true
}

export function trackPurchaseOnce(parameters: AnalyticsEvents['purchase']) {
  if (!hasAnalyticsConsent()) return false
  const storageKey = `${PURCHASE_STORAGE_PREFIX}${parameters.transaction_id}`

  try {
    if (localStorage.getItem(storageKey)) return false
    localStorage.setItem(storageKey, '1')
  } catch {
    // Tracking may still proceed when browser storage is unavailable.
  }

  return trackAnalyticsEvent('purchase', parameters)
}

export function sanitizedPagePath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0]
  return path.startsWith('/') ? path : `/${path}`
}
