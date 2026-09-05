import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  PARTNER_VISITOR_TOKEN_KEY,
  getConsentPreferences,
  hasAnalyticsConsent,
  hasMarketingConsent,
  saveConsentPreferences,
} from './consent'

describe('consent preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores valid preferences and exposes consent checks', () => {
    saveConsentPreferences({ analytics: true, marketing: true })

    expect(getConsentPreferences()).toMatchObject({
      necessary: true,
      analytics: true,
      marketing: true,
    })
    expect(hasAnalyticsConsent()).toBe(true)
    expect(hasMarketingConsent()).toBe(true)
  })

  it('removes partner attribution when marketing consent is withdrawn', () => {
    localStorage.setItem(PARTNER_VISITOR_TOKEN_KEY, 'private-token')

    saveConsentPreferences({ analytics: true, marketing: false })

    expect(localStorage.getItem(PARTNER_VISITOR_TOKEN_KEY)).toBeNull()
  })

  it('removes analytics identifiers when analytics consent is withdrawn', () => {
    localStorage.setItem('newwebinars_analytics_purchase_invoice_123', '1')
    localStorage.setItem('unrelated_key', 'keep')

    saveConsentPreferences({ analytics: false, marketing: true })

    expect(
      localStorage.getItem('newwebinars_analytics_purchase_invoice_123'),
    ).toBeNull()
    expect(localStorage.getItem('unrelated_key')).toBe('keep')
  })

  it('dispatches the consent change event', () => {
    const listener = vi.fn()
    window.addEventListener(CONSENT_CHANGED_EVENT, listener)

    saveConsentPreferences({ analytics: false, marketing: false })

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener)
  })

  it('rejects stored consent with an unsupported version', () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: 999,
        necessary: true,
        analytics: true,
        marketing: true,
      }),
    )

    expect(getConsentPreferences()).toBeNull()
  })
})
