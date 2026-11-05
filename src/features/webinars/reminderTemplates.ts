import type { ReminderRule } from '@/features/webinars/api/reminders'

export type MessageLanguage = 'lt' | 'en' | 'ru'

export type StandardReminder = {
  timing: ReminderRule['timing']
  minutes: number
  audience: ReminderRule['audience']
  subject: string
  body: string
  shortBody: string
}

type Slot = {
  timing: StandardReminder['timing']
  minutes: number
  audience: StandardReminder['audience']
  texts: Record<MessageLanguage, Pick<StandardReminder, 'subject' | 'body' | 'shortBody'>>
}

const SLOTS: Slot[] = [
  {
    timing: 'on_registration',
    minutes: 0,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Užsiregistravote: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\njūs užsiregistravote į „{{webinar_title}}“.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! Jūs užsiregistravote į „{{webinar_title}}“. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      },
      en: {
        subject: 'You are registered: {{webinar_title}}',
        body: 'Hello {{name}},\n\nyou are registered for "{{webinar_title}}".\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          'Hello {{name}}! You are registered for "{{webinar_title}}". Starts: {{starts_at}}. Join: {{webinar_link}}',
      },
      ru: {
        subject: 'Вы зарегистрированы: {{webinar_title}}',
        body: 'Здравствуйте, {{name}}!\n\nВы зарегистрировались на «{{webinar_title}}».\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! Вы зарегистрировались на «{{webinar_title}}». Начало: {{starts_at}}. Войти: {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 1440,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Rytoj: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\nrytoj vyks „{{webinar_title}}“.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! Rytoj vyks „{{webinar_title}}“. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      },
      en: {
        subject: 'Tomorrow: {{webinar_title}}',
        body: 'Hello {{name}},\n\n"{{webinar_title}}" is tomorrow.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          'Hello {{name}}! "{{webinar_title}}" is tomorrow. Starts: {{starts_at}}. Join: {{webinar_link}}',
      },
      ru: {
        subject: 'Завтра: {{webinar_title}}',
        body: 'Здравствуйте, {{name}}!\n\nЗавтра пройдёт «{{webinar_title}}».\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! Завтра пройдёт «{{webinar_title}}». Начало: {{starts_at}}. Войти: {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 60,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Po valandos: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po valandos.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po valandos. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      },
      en: {
        subject: 'In one hour: {{webinar_title}}',
        body: 'Hello {{name}},\n\n"{{webinar_title}}" starts in one hour.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          'Hello {{name}}! "{{webinar_title}}" starts in one hour. Starts: {{starts_at}}. Join: {{webinar_link}}',
      },
      ru: {
        subject: 'Через час: {{webinar_title}}',
        body: 'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» начнётся через час.\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! «{{webinar_title}}» начнётся через час. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 15,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Po 15 minučių: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po 15 minučių.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po 15 minučių. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      },
      en: {
        subject: 'In 15 minutes: {{webinar_title}}',
        body: 'Hello {{name}},\n\n"{{webinar_title}}" starts in 15 minutes.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          'Hello {{name}}! "{{webinar_title}}" starts in 15 minutes. Starts: {{starts_at}}. Join: {{webinar_link}}',
      },
      ru: {
        subject: 'Через 15 минут: {{webinar_title}}',
        body: 'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» начнётся через 15 минут.\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! «{{webinar_title}}» начнётся через 15 минут. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      },
    },
  },
  {
    timing: 'after_start',
    minutes: 5,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Jau prasidėjo: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ jau prasidėjo. Pradžia: {{starts_at}}\n\nPrisijunkite dabar:\n{{webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! „{{webinar_title}}“ jau prasidėjo. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      },
      en: {
        subject: 'Started: {{webinar_title}}',
        body: 'Hello {{name}},\n\n"{{webinar_title}}" has started. Starts: {{starts_at}}\n\nJoin now:\n{{webinar_link}}',
        shortBody:
          'Hello {{name}}! "{{webinar_title}}" has started. Starts: {{starts_at}}. Join: {{webinar_link}}',
      },
      ru: {
        subject: 'Уже началось: {{webinar_title}}',
        body: 'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» уже начался. Начало: {{starts_at}}\n\nПодключайтесь сейчас:\n{{webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! «{{webinar_title}}» уже начался. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      },
    },
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'attended',
    texts: {
      lt: {
        subject: 'Pasiūlymas po „{{webinar_title}}“',
        body: 'Sveiki, {{name}},\n\načiū, kad dalyvavote „{{webinar_title}}“.\n\nPasiūlymą rasite čia:\n{{offer_link}}',
        shortBody:
          'Sveiki, {{name}}! Ačiū, kad dalyvavote „{{webinar_title}}“. Pasiūlymas: {{offer_link}}',
      },
      en: {
        subject: 'Your offer after "{{webinar_title}}"',
        body: 'Hello {{name}},\n\nthank you for attending "{{webinar_title}}".\n\nThe offer is here:\n{{offer_link}}',
        shortBody:
          'Hello {{name}}! Thank you for attending "{{webinar_title}}". Offer: {{offer_link}}',
      },
      ru: {
        subject: 'Предложение после «{{webinar_title}}»',
        body: 'Здравствуйте, {{name}}!\n\nСпасибо, что были на «{{webinar_title}}».\n\nПредложение здесь:\n{{offer_link}}',
        shortBody:
          'Здравствуйте, {{name}}! Спасибо, что были на «{{webinar_title}}». Предложение: {{offer_link}}',
      },
    },
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'missed',
    texts: {
      lt: {
        subject: '„{{webinar_title}}“ kartosis',
        body: 'Sveiki, {{name}},\n\nšį kartą „{{webinar_title}}“ praleidote. Kitas laikas: {{next_session}}.\n\nRegistracija:\n{{public_webinar_link}}',
        shortBody:
          'Sveiki, {{name}}! „{{webinar_title}}“ šį kartą praleidote. Kitas laikas: {{next_session}}. {{public_webinar_link}}',
      },
      en: {
        subject: '"{{webinar_title}}" will run again',
        body: 'Hello {{name}},\n\nyou missed "{{webinar_title}}" this time. Next time: {{next_session}}.\n\nRegistration:\n{{public_webinar_link}}',
        shortBody:
          'Hello {{name}}! You missed "{{webinar_title}}" this time. Next time: {{next_session}}. {{public_webinar_link}}',
      },
      ru: {
        subject: '«{{webinar_title}}» повторится',
        body: 'Здравствуйте, {{name}}!\n\nВ этот раз вы пропустили «{{webinar_title}}». Следующий раз: {{next_session}}.\n\nРегистрация:\n{{public_webinar_link}}',
        shortBody:
          'Здравствуйте, {{name}}! В этот раз вы пропустили «{{webinar_title}}». Следующий раз: {{next_session}}. {{public_webinar_link}}',
      },
    },
  },
]

export function normalizeMessageLanguage(value: string | null | undefined): MessageLanguage {
  if (value === 'en' || value === 'ru') return value
  return 'lt'
}

export function standardReminders(language: MessageLanguage): StandardReminder[] {
  return SLOTS.map((slot) => ({
    timing: slot.timing,
    minutes: slot.minutes,
    audience: slot.audience,
    ...slot.texts[language],
  }))
}

function sameText(left: string | null | undefined, right: string) {
  return (left ?? '').trim() === right.trim()
}

export function translatedStandardReminder(
  language: MessageLanguage,
  rule: Pick<
    ReminderRule,
    'timing' | 'minutes_before' | 'audience' | 'channel' | 'subject' | 'body'
  >,
) {
  const slot = SLOTS.find(
    (item) =>
      item.timing === rule.timing &&
      item.minutes === rule.minutes_before &&
      item.audience === (rule.audience ?? 'all'),
  )
  if (!slot) return null
  const untouched = (['lt', 'en', 'ru'] as const).some((item) => {
    const text = slot.texts[item]
    const expectedBody = rule.channel === 'email' ? text.body : text.shortBody
    return sameText(rule.subject, text.subject) && sameText(rule.body, expectedBody)
  })
  if (!untouched) return null
  const next = slot.texts[language]
  return {
    subject: next.subject,
    body: rule.channel === 'email' ? next.body : next.shortBody,
  }
}
