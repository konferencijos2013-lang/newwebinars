import type { PlatformRole } from '@/shared/database.types'

export type { PlatformRole }

export interface AppUser {
  id: string
  email: string | null
  role: PlatformRole
}
