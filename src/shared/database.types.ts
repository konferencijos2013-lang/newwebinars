export type PlatformRole = 'guest' | 'admin'
export type AccountMemberRole = 'owner' | 'admin' | 'editor' | 'host' | 'viewer'
export type AccountPlan = 'free' | 'paid' | 'vip'
export type WebinarType = 'live' | 'automated'
export type WebinarStatus =
  'draft' | 'published' | 'live' | 'ended' | 'cancelled'
export type RegistrationStatus =
  'registered' | 'attended' | 'cancelled' | 'no_show'
export type MessageType = 'chat' | 'system' | 'offer'
export type ReminderChannel = 'email' | 'telegram'
export type IntegrationProvider = 'brevo' | 'resend' | 'smtp' | 'manychat'
export type IntegrationStatus = 'active' | 'disabled' | 'error'
export type PartnerType = 'affiliate' | 'business'
export type WebinarSessionStatus = 'upcoming' | 'live' | 'ended' | 'cancelled'
export type ReminderStatus =
  'queued' | 'processing' | 'sent' | 'failed' | 'cancelled'
export type ReminderLogStatus = 'sent' | 'failed'
export type FunnelStatus = 'draft' | 'published' | 'archived'
export type FunnelStepType =
  | 'registration'
  | 'waiting_room'
  | 'webinar_room'
  | 'offer'
  | 'order_form'
  | 'thank_you'
  | 'lead_magnet'
export type WebinarAccessMode =
  'public' | 'password_protected' | 'paid_access' | 'invited_only'
export type WebinarScheduleType =
  'on_demand' | 'fixed' | 'recurring' | 'just_in_time'
export type ChatScriptSenderRole = 'attendee' | 'host'
export type ChatScriptSource = 'manual' | 'imported' | 'ai'
export type RecordingStatus = 'processing' | 'ready' | 'archived' | 'deleted'
export type CreditType =
  | 'live_webinar_minute'
  | 'automated_webinar_minute'
  | 'recording_storage_gb_month'
  | 'registration'
  | 'email_sent'
  | 'sms_sent'
  | 'ai_token'
  | 'support_ticket'
export type UsageEventScope =
  'webinar' | 'recording' | 'storage' | 'ai' | 'other'
export type SubscriptionStatus =
  'incomplete' | 'active' | 'past_due' | 'canceled' | 'paused' | 'trialing'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type AiPromptScope =
  'global' | 'webinar' | 'funnel' | 'chat_script' | 'support'
export type AiMessageRole = 'user' | 'assistant' | 'system'

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
  public_subdomain: string | null
  custom_domain: string | null
  custom_domain_status: 'not_configured' | 'pending_dns' | 'verified'
  created_at: string
  updated_at: string
}

export interface AccountMember {
  account_id: string
  user_id: string
  role: AccountMemberRole
  joined_at: string
}

export interface IntegrationConnection {
  id: string
  account_id: string
  provider: IntegrationProvider
  display_name: string
  status: IntegrationStatus
  config: Record<string, unknown>
  last_tested_at: string | null
  last_error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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

export type CfStreamStatus = 'idle' | 'connected' | 'live' | 'ended' | 'errored'
export type StreamProvider = 'cloudflare' | 'youtube'

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
  chat_script_offset_seconds: number
  access_mode: WebinarAccessMode
  password_hash: string | null
  price_cents: number | null
  stream_provider: StreamProvider
  youtube_live_url: string | null
  cf_live_input_uid: string | null
  cf_stream_status: CfStreamStatus
  cf_playback_hls_url: string | null
  cf_playback_dash_url: string | null
  cf_recording_video_uid: string | null
  created_at: string
  updated_at: string
}

export interface WebinarLiveSession {
  id: string
  webinar_id: string
  cf_live_input_uid: string
  started_at: string | null
  ended_at: string | null
  duration_seconds: number
  peak_viewers: number
  recording_video_uid: string | null
  status: WebinarLiveSessionStatus
  created_at: string
  updated_at: string
}

export type WebinarLiveSessionStatus = 'pending' | 'live' | 'ended' | 'errored'

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

export interface WebinarCtaScriptEvent {
  id: string
  webinar_id: string
  trigger_seconds: number
  action: 'show' | 'hide'
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WebinarCtaLiveState {
  webinar_id: string
  is_visible: boolean
  changed_at: string
  changed_by: string | null
}

export interface Registration {
  id: string
  webinar_id: string
  session_id: string | null
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
  entered_at: string | null
  joined_at: string | null
  left_at: string | null
  attended_seconds: number
  saw_offer_at: string | null
  saw_offer_clicked_at: string | null
  offer_clicked_at: string | null
  chat_blocked_at: string | null
  chat_blocked_by: string | null
  removed_from_webinar_at: string | null
  removed_from_webinar_by: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer_url: string | null
  referral_code: string | null
  phone: string | null
  company: string | null
  telegram_username: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  webinar_id: string
  sender_id: string | null
  registration_id: string | null
  sender_name: string
  message: string
  message_type: MessageType
  sent_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface WebinarChatScript {
  id: string
  webinar_id: string
  trigger_seconds: number
  display_name: string
  sender_role: ChatScriptSenderRole
  message: string
  sort_order: number
  is_active: boolean
  source: ChatScriptSource
  created_at: string
  updated_at: string
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

export interface WebinarSession {
  id: string
  webinar_id: string
  title: string | null
  starts_at: string | null
  ends_at: string | null
  status: WebinarSessionStatus
  capacity: number | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface WebinarSchedule {
  id: string
  webinar_id: string
  schedule_type: WebinarScheduleType
  starts_at: string | null
  ends_at: string | null
  recurrence_rule: string | null
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Funnel {
  id: string
  account_id: string
  name: string
  slug: string
  status: FunnelStatus
  webinar_id: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface FunnelPage {
  id: string
  funnel_id: string
  name: string
  step_type: FunnelStepType
  path: string
  is_default: boolean
  theme: Record<string, unknown> | null
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

export interface FunnelBlock {
  id: string
  page_id: string
  block_type: string
  sort_order: number
  content: Record<string, unknown>
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ReminderQueue {
  id: string
  registration_id: string
  rule_id: string | null
  scheduled_at: string
  status: ReminderStatus
  sent_at: string | null
  failed_at: string | null
  error_message: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface ReminderLog {
  id: string
  queue_id: string
  registration_id: string
  rule_id: string | null
  status: ReminderLogStatus
  provider_response: string | null
  sent_at: string
}

export interface PartnerClick {
  id: string
  partner_code: string
  clicked_at: string
  ip_address: string | null
  user_agent: string | null
  referrer_url: string | null
  landing_path: string | null
  webinar_id: string | null
  converted_registration_id: string | null
  utm_source: string | null
  created_at: string
}

export interface Recording {
  id: string
  account_id: string
  webinar_id: string | null
  session_id: string | null
  title: string
  description: string | null
  storage_path: string
  status: RecordingStatus
  duration_seconds: number | null
  size_bytes: number
  recording_url: string | null
  thumbnail_url: string | null
  is_public: boolean
  metadata: Record<string, unknown> | null
  recorded_at: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

export interface AccountStorageUsage {
  account_id: string
  total_bytes: number
  quota_bytes: number
  recordings_count: number
  updated_at: string
}

export interface CreditPlan {
  id: string
  name: string
  stripe_price_id: string | null
  is_active: boolean
  is_default: boolean
  monthly_credits: Record<string, number>
  limits: Record<string, unknown>
  price_cents: number
  interval: 'month' | 'year'
  created_at: string
  updated_at: string
}

export interface AccountCredit {
  id: string
  account_id: string
  credit_type: CreditType
  balance: number
  rollover_balance: number
  period_started_at: string
  period_ends_at: string
  created_at: string
  updated_at: string
}

export interface UsageEvent {
  id: string
  account_id: string
  credit_type: CreditType
  scope: UsageEventScope
  scope_id: string | null
  quantity: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface BillingCustomer {
  id: string
  account_id: string
  stripe_customer_id: string
  email: string | null
  name: string | null
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  account_id: string
  credit_plan_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  account_id: string
  subscription_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  amount_cents: number
  currency: string
  status: PaymentStatus
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface AiPrompt {
  id: string
  account_id: string | null
  scope: AiPromptScope
  scope_id: string | null
  name: string
  system_prompt: string | null
  user_prompt_template: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AiThread {
  id: string
  account_id: string
  user_id: string
  title: string
  scope: AiPromptScope
  scope_id: string | null
  created_at: string
  updated_at: string
}

export interface AiMessage {
  id: string
  thread_id: string
  role: AiMessageRole
  content: string
  tokens_used: number | null
  metadata: Record<string, unknown> | null
  created_at: string
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
