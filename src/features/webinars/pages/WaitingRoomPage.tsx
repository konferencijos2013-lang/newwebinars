import { useParams, useSearchParams } from 'react-router'
import { WaitingRoomRuntime } from '@/features/webinars/components/WaitingRoomRuntime'

export function WaitingRoomPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()

  return (
    <WaitingRoomRuntime
      webinarSlug={slug}
      accessToken={searchParams.get('token') ?? ''}
    />
  )
}
