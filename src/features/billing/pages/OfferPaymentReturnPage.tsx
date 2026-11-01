import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { confirmOfferCheckout } from '@/features/webinars/api/public'

export function OfferPaymentReturnPage() {
  const [params] = useSearchParams()
  const orderId = params.get('order') ?? ''
  const sessionId = params.get('session_id')
  const paypalOrderId = params.get('token')
  const cancelled = params.get('result') === 'cancel'
  const [status, setStatus] = useState<
    'loading' | 'paid' | 'pending' | 'cancelled' | 'error'
  >(cancelled ? 'cancelled' : 'loading')
  const [continueUrl, setContinueUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cancelled || !orderId) return
    let active = true
    let attempts = 0
    let timer = 0
    const tick = async () => {
      try {
        const result = await confirmOfferCheckout({
          orderId,
          sessionId,
          paypalOrderId,
        })
        if (!active) return
        setContinueUrl(result.continue_url)
        if (result.status === 'paid') {
          setStatus('paid')
          return
        }
        attempts += 1
        if (attempts < 8) {
          timer = window.setTimeout(() => void tick(), 2000)
          return
        }
        setStatus('pending')
      } catch (reason) {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Mokėjimo patvirtinti nepavyko.',
        )
        setStatus('error')
      }
    }
    void tick()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [cancelled, orderId, paypalOrderId, sessionId])

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full text-center">
        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner className="h-8 w-8" />
            <CardTitle>Tikrinamas mokėjimas</CardTitle>
          </div>
        ) : null}
        {status === 'paid' ? (
          <>
            <CardTitle>Apmokėta</CardTitle>
            <CardDescription className="mt-2">
              Mokėjimas gautas. Galite tęsti prie pasiūlymo.
            </CardDescription>
            {continueUrl ? (
              <Button
                className="mt-6"
                onClick={() => window.location.assign(continueUrl)}
              >
                Tęsti
              </Button>
            ) : null}
          </>
        ) : null}
        {status === 'pending' ? (
          <>
            <CardTitle>Mokėjimas dar nepatvirtintas</CardTitle>
            <CardDescription className="mt-2">
              Jei bankas jau patvirtino, palaukite minutę ir atnaujinkite
              puslapį.
            </CardDescription>
          </>
        ) : null}
        {status === 'cancelled' ? (
          <>
            <CardTitle>Mokėjimas atšauktas</CardTitle>
            <CardDescription className="mt-2">
              Galite grįžti į vebinarą ir bandyti dar kartą.
            </CardDescription>
          </>
        ) : null}
        {status === 'error' ? (
          <>
            <CardTitle>Mokėjimo patvirtinti nepavyko</CardTitle>
            <CardDescription className="mt-2">{error}</CardDescription>
          </>
        ) : null}
      </Card>
    </div>
  )
}
