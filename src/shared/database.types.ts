export type PlatformRole = 'guest' | 'admin'
export type AccountMemberRole = 'owner' | 'admin' | 'host' | 'viewer'
export type AccountPlan = 'free' | 'paid' | 'vip'
export type WebinarType = 'live' | 'automated'
export type WebinarStatus =
  'draft' | 'published' | 'live' | 'ended' | 'cancelled'
export type RegistrationStatus =
  'registered' | 'attended' | 'cancelled' | 'no_show'
export type MessageType = 'chat' | 'system' | 'offer'
export type ReminderChannel = 'email' | 'telegram'
export type PartnerType = 'affiliate' | 'business'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: PlatformRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  slug: string
  name: string
  owner_id: string
  plan: AccountPlan
  created_at: string
  updated_at: string
}

export interface AccountMember {
  account_id: string
  user_id: string
  role: AccountMemberRole
  joined_at: string
}

export interface Partner {
  id: string
  name: string
  email: string | null
  code: string
  type: PartnerType
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Webinar {
  id: string
  account_id: string
  presenter_id: string | null
  presenter_name: string | null
  slug: string
  title: string
  description: string | null
  type: WebinarType
  status: WebinarStatus
  scheduled_at: string | null
  duration_minutes: number | null
  max_participants: number | null
  waiting_room_enabled: boolean
  early_entry_minutes: number
  meeting_url: string | null
  automated_video_url: string | null
  recording_url: string | null
  offer_enabled: boolean
  created_at: string
  updated_at: string
}

export interface WebinarOffer {
  id: string
  webinar_id: string
  title: string
  description: string | null
  button_text: string
  target_url: string | null
  display_at_seconds: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Registration {
  id: string
  webinar_id: string
  user_id: string | null
  access_token: string
  email: string
  full_name: string | null
  status: RegistrationStatus
  registered_at: string
  confirmed_at: string | null
  entered_waiting_room_at: string | null
  joined_webinar_at: string | null
  left_webinar_at: string | null
  watch_time_seconds: number
  saw_offer_at: string | null
  offer_clicked_at: string | null
  utm_source: string | null
  referrer_url: string | null
  referral_code: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  webinar_id: string
  sender_id: string | null
  sender_name: string
  message: string
  message_type: MessageType
  sent_at: string
}

export interface ReminderRule {
  id: string
  webinar_id: string
  channel: ReminderChannel
  minutes_before: number
  subject: string | null
  body: string | null
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface PublishedWebinar {
  id: string
  slug: string
  account_id: string
  account_name: string
  account_slug: string
  presenter_name: string | null
  title: string
  description: string | null
  type: WebinarType
  status: WebinarStatus
  scheduled_at: string | null
  duration_minutes: number | null
  max_participants: number | null
  waiting_room_enabled: boolean
  early_entry_minutes: number
  created_at: string
}
