import type { Registration, Webinar } from '@/shared/database.types'

export interface WaitingRoomDestinationContext {
  webinar: Webinar
  registration: Registration
  accessToken: string
}

export function getStandardWaitingRoomDestination({
  webinar,
  registration,
}: WaitingRoomDestinationContext) {
  return `/${webinar.slug}/room?token=${encodeURIComponent(registration.access_token)}`
}
