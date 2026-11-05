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
        subject: 'Ko „{{webinar_title}}“ pavadinimas jums nepasako',
        body: 'Sveiki, {{name}},\n\npavadinimas pasako temą. Jis nutyli tą vietą, dėl kurios vėliau sakoma: šitą reikėjo išgirsti gyvai.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          '{{name}}, „{{webinar_title}}“ pavadinimas nutyli svarbiausią vietą. Pradžia: {{starts_at}}. {{webinar_link}}',
      },
      en: {
        subject: 'What the title "{{webinar_title}}" leaves out',
        body: 'Hello {{name}},\n\nthe title names the topic. It stays quiet about the part people later wish they had heard live.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          '{{name}}, the title "{{webinar_title}}" leaves out the part that matters. Starts: {{starts_at}}. {{webinar_link}}',
      },
      ru: {
        subject: 'Чего не говорит название «{{webinar_title}}»',
        body: 'Здравствуйте, {{name}}!\n\nНазвание называет тему. Оно молчит о том месте, которое потом хочется услышать вживую.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          '{{name}}, название «{{webinar_title}}» молчит о самом важном. Начало: {{starts_at}}. {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 1440,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Rytoj paaiškės tai, ko „{{webinar_title}}“ anonsas nerodo',
        body: 'Sveiki, {{name}},\n\nrytoj skirtumas bus ne kalendoriuje. Skirtumas bus tas, ar būsite kambaryje, kai pasakys tai, ko skelbime nėra.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          '{{name}}, rytoj „{{webinar_title}}“ pasakys tai, ko skelbime nėra. Pradžia: {{starts_at}}. {{webinar_link}}',
      },
      en: {
        subject: 'Tomorrow "{{webinar_title}}" shows what the announcement hides',
        body: 'Hello {{name}},\n\ntomorrow the difference is not the calendar. The difference is whether you are in the room when they say what the announcement left out.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          '{{name}}, tomorrow "{{webinar_title}}" says what the announcement left out. Starts: {{starts_at}}. {{webinar_link}}',
      },
      ru: {
        subject: 'Завтра «{{webinar_title}}» покажет то, чего нет в анонсе',
        body: 'Здравствуйте, {{name}}!\n\nзавтра разница будет не в календаре. Разница в том, будете ли вы в комнате, когда скажут то, чего нет в анонсе.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          '{{name}}, завтра «{{webinar_title}}» скажет то, чего нет в анонсе. Начало: {{starts_at}}. {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 60,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Liko valanda. „{{webinar_title}}“ prasidės su jumis arba be jūsų',
        body: 'Sveiki, {{name}},\n\npo valandos pirma mintis nuskambės vieną kartą. Vėliau ją tenka dėlioti iš to, ką kiti jau suprato.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          '{{name}}, po valandos „{{webinar_title}}“ pasakys pirmą mintį vieną kartą. Pradžia: {{starts_at}}. {{webinar_link}}',
      },
      en: {
        subject: 'One hour left. "{{webinar_title}}" starts with you or without you',
        body: 'Hello {{name}},\n\nin one hour the opening idea is said once. After that you rebuild it from what everyone else already understood.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          '{{name}}, in one hour "{{webinar_title}}" says the opening idea once. Starts: {{starts_at}}. {{webinar_link}}',
      },
      ru: {
        subject: 'Остался час. «{{webinar_title}}» начнётся с вами или без вас',
        body: 'Здравствуйте, {{name}}!\n\nчерез час первую мысль скажут один раз. Потом её приходится собирать из того, что остальные уже поняли.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          '{{name}}, через час «{{webinar_title}}» скажет первую мысль один раз. Начало: {{starts_at}}. {{webinar_link}}',
      },
    },
  },
  {
    timing: 'before_start',
    minutes: 15,
    audience: 'all',
    texts: {
      lt: {
        subject: 'Dar 15 minučių, ir „{{webinar_title}}“ prasideda',
        body: 'Sveiki, {{name}},\n\npirmos minutės būna trumpos. Būtent jas vėliau tenka atsukti mintyse, jei jų negirdėjote.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}',
        shortBody:
          '{{name}}, po 15 minučių „{{webinar_title}}“ pradeda nuo trumpos pirmos minties. Pradžia: {{starts_at}}. {{webinar_link}}',
      },
      en: {
        subject: '15 minutes until "{{webinar_title}}" opens',
        body: 'Hello {{name}},\n\nthe first minutes are short. Those are the ones you later replay in your head if you missed them.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
        shortBody:
          '{{name}}, in 15 minutes "{{webinar_title}}" opens with a short first idea. Starts: {{starts_at}}. {{webinar_link}}',
      },
      ru: {
        subject: 'Ещё 15 минут, и «{{webinar_title}}» начинается',
        body: 'Здравствуйте, {{name}}!\n\nпервые минуты короткие. Именно их потом прокручиваешь в голове, если не услышал.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
        shortBody:
          '{{name}}, через 15 минут «{{webinar_title}}» начнётся с короткой первой мысли. Начало: {{starts_at}}. {{webinar_link}}',
      },
    },
  },
  {
    timing: 'after_start',
    minutes: 5,
    audience: 'all',
    texts: {
      lt: {
        subject: '„{{webinar_title}}“ jau kalba. Jūsų vieta dar tuščia',
        body: 'Sveiki, {{name}},\n\nkambarys jau atidarytas. Kuo ilgiau stovite už durų, tuo daugiau pirmos dalies tenka suprasti iš nuotrupų.\n\n{{highlights}}Pradžia buvo: {{starts_at}}\n\nĮeiti dabar:\n{{webinar_link}}',
        shortBody:
          '{{name}}, „{{webinar_title}}“ jau kalba, o jūsų vieta tuščia. {{webinar_link}}',
      },
      en: {
        subject: '"{{webinar_title}}" is already talking. Your seat is still empty',
        body: 'Hello {{name}},\n\nthe room is open. The longer you stay outside, the more of the opening you have to piece together from fragments.\n\n{{highlights}}Started: {{starts_at}}\n\nCome in now:\n{{webinar_link}}',
        shortBody:
          '{{name}}, "{{webinar_title}}" is already talking and your seat is empty. {{webinar_link}}',
      },
      ru: {
        subject: '«{{webinar_title}}» уже говорит. Ваше место ещё пустое',
        body: 'Здравствуйте, {{name}}!\n\nкомната уже открыта. Чем дольше вы за дверью, тем больше начала приходится собирать по обрывкам.\n\n{{highlights}}Начало было: {{starts_at}}\n\nВойти сейчас:\n{{webinar_link}}',
        shortBody:
          '{{name}}, «{{webinar_title}}» уже говорит, а ваше место пустое. {{webinar_link}}',
      },
    },
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'attended',
    texts: {
      lt: {
        subject: 'Matėte „{{webinar_title}}“. Vienas žingsnis dar liko',
        body: 'Sveiki, {{name}},\n\nžiūrėjimas nieko nepakeičia, kol nepadarote to žingsnio, kurį vebinare parodė kaip kitą.\n\n{{highlights}}Kitas žingsnis:\n{{offer_link}}',
        shortBody:
          '{{name}}, „{{webinar_title}}“ jau pasibaigė, o vienas žingsnis dar liko. {{offer_link}}',
      },
      en: {
        subject: 'You saw "{{webinar_title}}". One step is still open',
        body: 'Hello {{name}},\n\nwatching changes nothing until you take the step the webinar pointed to next.\n\n{{highlights}}The next step:\n{{offer_link}}',
        shortBody:
          '{{name}}, "{{webinar_title}}" is over and one step is still open. {{offer_link}}',
      },
      ru: {
        subject: 'Вы видели «{{webinar_title}}». Один шаг ещё остался',
        body: 'Здравствуйте, {{name}}!\n\nпросмотр ничего не меняет, пока вы не делаете тот шаг, который на вебинаре показали следующим.\n\n{{highlights}}Следующий шаг:\n{{offer_link}}',
        shortBody:
          '{{name}}, «{{webinar_title}}» закончился, а один шаг ещё остался. {{offer_link}}',
      },
    },
  },
  {
    timing: 'after_end',
    minutes: 10,
    audience: 'missed',
    texts: {
      lt: {
        subject: 'Jūsų nebuvo „{{webinar_title}}“. Turinys niekur nedingo',
        body: 'Sveiki, {{name}},\n\nšį kartą salė praėjo be jūsų. Kitas laikas yra tas pats vebinaras, ne kitas pažadas.\n\n{{highlights}}Kitas laikas: {{next_session}}\n\nRegistracija:\n{{public_webinar_link}}',
        shortBody:
          '{{name}}, „{{webinar_title}}“ šį kartą praėjo be jūsų. Kitas laikas: {{next_session}}. {{public_webinar_link}}',
      },
      en: {
        subject: 'You missed "{{webinar_title}}". The content is still there',
        body: 'Hello {{name}},\n\nthis time the room went on without you. The next time is the same webinar, not a different promise.\n\n{{highlights}}Next time: {{next_session}}\n\nRegistration:\n{{public_webinar_link}}',
        shortBody:
          '{{name}}, "{{webinar_title}}" went on without you this time. Next time: {{next_session}}. {{public_webinar_link}}',
      },
      ru: {
        subject: 'Вас не было на «{{webinar_title}}». Содержание никуда не делось',
        body: 'Здравствуйте, {{name}}!\n\nв этот раз зал прошёл без вас. Следующий раз — тот же вебинар, а не другое обещание.\n\n{{highlights}}Следующий раз: {{next_session}}\n\nРегистрация:\n{{public_webinar_link}}',
        shortBody:
          '{{name}}, «{{webinar_title}}» в этот раз прошёл без вас. Следующий раз: {{next_session}}. {{public_webinar_link}}',
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
