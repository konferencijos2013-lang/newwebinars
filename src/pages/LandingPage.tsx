import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { CTABanner } from '@/components/landing/CTABanner'

export function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <CTABanner />
    </>
  )
}
