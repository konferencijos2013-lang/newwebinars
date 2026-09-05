import { beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  type ConsentPreferences,
} from '@/features/consent/consent'
import {
  sanitizedPagePath,
  trackAnalyticsEvent,
  trackPurchaseOnce,
} from './dataLayer'

declare global {
  interface Window {
    dataLayer?: (unknown[] | Record<string, unknown>)[]
  }
}

function setConsent(analytics: boolean) {
  const preferences: ConsentPreferences = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics,
    marketing: false,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences))
}

describe('analytics data layer', () => {
  beforeEach(() => {
    localStorage.clear()
    window.dataLayer = []
  })

  it('does not track events without analytics consent', () => {
    expect(
      trackAnalyticsEvent('page_view', { page_path: '/webinar/demo' }),
    ).toBe(false)
    expect(window.dataLayer).toEqual([])
  })

  it('pushes allow-listed events after analytics consent', () => {
    setConsent(true)

    expect(
      trackAnalyticsEvent('begin_checkout', {
        currency: 'EUR',
        value: 49,
        plan_code: 'pro',
        billing_interval: 'month',
      }),
    ).toBe(true)
    expect(window.dataLayer).toEqual([
      {
        event: 'begin_checkout',
        currency: 'EUR',
        value: 49,
        plan_code: 'pro',
        billing_interval: 'month',
      },
    ])
  })

  it('deduplicates purchases by transaction id', () => {
    setConsent(true)
    const purchase = {
      transaction_id: 'invoice_123',
      currency: 'EUR',
      value: 49,
    }

    expect(trackPurchaseOnce(purchase)).toBe(true)
    expect(trackPurchaseOnce(purchase)).toBe(false)
    expect(window.dataLayer).toEqual([{ event: 'purchase', ...purchase }])
  })

  it('does not reserve a purchase id before analytics consent', () => {
    const purchase = {
      transaction_id: 'invoice_456',
      currency: 'EUR',
      value: 99,
    }

    expect(trackPurchaseOnce(purchase)).toBe(false)
    setConsent(true)
    expect(trackPurchaseOnce(purchase)).toBe(true)
  })

  it('removes query strings and fragments from page paths', () => {
    expect(sanitizedPagePath('/auth/callback?code=secret#result')).toBe(
      '/auth/callback',
    )
    expect(sanitizedPagePath('pricing?utm_source=ad')).toBe('/pricing')
  })
})
