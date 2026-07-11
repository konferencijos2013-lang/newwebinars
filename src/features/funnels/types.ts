export type FunnelBlockType =
  | 'hero'
  | 'text'
  | 'video'
  | 'registration_form'
  | 'countdown'
  | 'benefits'
  | 'speaker'
  | 'chat'
  | 'cta'
  | 'offer'
  | 'order_form'
  | 'faq'

export interface FunnelBlockDef {
  type: FunnelBlockType
  label: string
  icon: string
  defaultContent: Record<string, unknown>
  defaultSettings: Record<string, unknown>
}

export const FUNNEL_BLOCK_REGISTRY: Record<FunnelBlockType, FunnelBlockDef> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    icon: 'Sparkles',
    defaultContent: {
      title: 'Webinar title',
      subtitle: 'Join us for a live session',
      align: 'center',
    },
    defaultSettings: {},
  },
  text: {
    type: 'text',
    label: 'Text',
    icon: 'Type',
    defaultContent: { text: 'Write something compelling...' },
    defaultSettings: {},
  },
  video: {
    type: 'video',
    label: 'Video',
    icon: 'Play',
    defaultContent: { url: '', provider: 'youtube' },
    defaultSettings: {},
  },
  registration_form: {
    type: 'registration_form',
    label: 'Registration Form',
    icon: 'FormInput',
    defaultContent: { buttonText: 'Register now' },
    defaultSettings: {},
  },
  countdown: {
    type: 'countdown',
    label: 'Countdown',
    icon: 'Clock',
    defaultContent: { target: null },
    defaultSettings: {},
  },
  benefits: {
    type: 'benefits',
    label: 'Benefits',
    icon: 'ListChecks',
    defaultContent: { items: ['Benefit one', 'Benefit two'] },
    defaultSettings: {},
  },
  speaker: {
    type: 'speaker',
    label: 'Speaker',
    icon: 'User',
    defaultContent: { name: 'Speaker name', bio: 'Short bio' },
    defaultSettings: {},
  },
  chat: {
    type: 'chat',
    label: 'Chat',
    icon: 'MessageCircle',
    defaultContent: { title: 'Live chat' },
    defaultSettings: {},
  },
  cta: {
    type: 'cta',
    label: 'CTA',
    icon: 'MousePointer',
    defaultContent: { text: 'Get access now', url: '#' },
    defaultSettings: {},
  },
  offer: {
    type: 'offer',
    label: 'Offer',
    icon: 'Gift',
    defaultContent: { title: 'Special offer', price: '' },
    defaultSettings: {},
  },
  order_form: {
    type: 'order_form',
    label: 'Order Form',
    icon: 'CreditCard',
    defaultContent: { buttonText: 'Complete purchase' },
    defaultSettings: {},
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    icon: 'HelpCircle',
    defaultContent: {
      items: [{ question: 'Question?', answer: 'Answer.' }],
    },
    defaultSettings: {},
  },
}
