import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { CTABanner } from '@/components/landing/CTABanner'

export function LandingPage() {
  const { t, i18n } = useTranslation(['landing', 'common'])

  useEffect(() => {
    document.title = `${t('common:appName')} — ${t('landing:hero.headline')}`
  }, [t, i18n.language])

  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <CTABanner />
    </>
  )
}
