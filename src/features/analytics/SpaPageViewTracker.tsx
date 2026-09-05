import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import {
  CONSENT_CHANGED_EVENT,
  getConsentPreferences,
  type ConsentPreferences,
} from '@/features/consent/consent'
import { sanitizedPagePath, trackAnalyticsEvent } from './dataLayer'

export function SpaPageViewTracker() {
  const location = useLocation()
  const pathnameRef = useRef(location.pathname)
  const lastTrackedPathRef = useRef<string | null>(null)
  const analyticsConsentRef = useRef(
    getConsentPreferences()?.analytics === true,
  )

  useEffect(() => {
    pathnameRef.current = location.pathname
    const pagePath = sanitizedPagePath(location.pathname)
    if (lastTrackedPathRef.current === pagePath) return
    if (trackAnalyticsEvent('page_view', { page_path: pagePath })) {
      lastTrackedPathRef.current = pagePath
    }
  }, [location.pathname])

  useEffect(() => {
    const handleConsentChange = (event: Event) => {
      const preferences = (event as CustomEvent<ConsentPreferences>).detail
      const analyticsWasGranted = analyticsConsentRef.current
      analyticsConsentRef.current = preferences.analytics

      if (preferences.analytics && !analyticsWasGranted) {
        const pagePath = sanitizedPagePath(pathnameRef.current)
        if (trackAnalyticsEvent('page_view', { page_path: pagePath })) {
          lastTrackedPathRef.current = pagePath
        }
      }
    }

    window.addEventListener(CONSENT_CHANGED_EVENT, handleConsentChange)
    return () =>
      window.removeEventListener(CONSENT_CHANGED_EVENT, handleConsentChange)
  }, [])

  return null
}
