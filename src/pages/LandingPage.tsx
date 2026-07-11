import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { CTABanner } from '@/components/landing/CTABanner'
import { useUser } from '@/features/auth/hooks/useUser'
import { Spinner } from '@/components/ui/Spinner'

export function LandingPage() {
  const navigate = useNavigate()
  const { status } = useUser()

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
      body: JSON.stringify({
        sessionId: '85756a',
        id: 'log_landing_mounted',
        runId: 'initial',
        hypothesisId: 'D',
        location: 'src/pages/LandingPage.tsx:14',
        message: 'LandingPage mounted',
        data: { status, hasHash: window.location.hash.includes('access_token') },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    // If OAuth redirected to root with access_token hash, forward to callback handler
    if (window.location.hash.includes('access_token')) {
      // #region agent log
      fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
        body: JSON.stringify({
          sessionId: '85756a',
          id: 'log_landing_hash_redirect',
          runId: 'initial',
          hypothesisId: 'B',
          location: 'src/pages/LandingPage.tsx:16',
          message: 'Root hash token detected, redirecting to /auth/callback',
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      navigate('/auth/callback' + window.location.hash, { replace: true })
      return
    }

    if (status === 'authenticated') {
      navigate('/dashboard', { replace: true })
    }
  }, [status, navigate])

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <CTABanner />
    </>
  )
}
