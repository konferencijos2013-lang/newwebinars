import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import {
  hasMarketingConsent,
  PARTNER_VISITOR_TOKEN_KEY,
} from '@/features/consent/consent'

async function createVisitorTokenHash() {
  const token = crypto.getRandomValues(new Uint8Array(32))
  const digest = await crypto.subtle.digest('SHA-256', token)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export function PartnerReferralRedirectPage() {
  const { code = '' } = useParams()
  const { t } = useTranslation('common')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const candidate = params.get('to')
    const destination =
      candidate && candidate.startsWith('/') && !candidate.startsWith('//')
        ? candidate
        : '/'
    const recordClick = async () => {
      if (hasMarketingConsent()) {
        const visitorToken =
          localStorage.getItem(PARTNER_VISITOR_TOKEN_KEY) ??
          (await createVisitorTokenHash())
        localStorage.setItem(PARTNER_VISITOR_TOKEN_KEY, visitorToken)

        await supabase.rpc('record_platform_partner_click', {
          p_code: code,
          p_visitor_token_hash: visitorToken,
          p_landing_path: destination,
          p_referrer_url: document.referrer || null,
          p_utm_source: params.get('utm_source'),
          p_utm_medium: params.get('utm_medium'),
          p_utm_campaign: params.get('utm_campaign'),
        })
      }
      window.location.replace(destination)
    }
    void recordClick()
  }, [code])

  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
      {t('redirecting')}
    </div>
  )
}
