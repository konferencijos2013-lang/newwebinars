import type { FunnelStepType } from '@/shared/database.types'
import type { FunnelRuntimeBlockType } from './types'

export const FUNNEL_TEMPLATE_LANGUAGES = ['lt', 'en', 'ru'] as const
export type FunnelTemplateLanguage = (typeof FUNNEL_TEMPLATE_LANGUAGES)[number]
export type FunnelTemplateStep = Extract<
  FunnelStepType,
  'registration' | 'waiting_room' | 'offer'
>

export type FunnelTemplateTheme = Record<string, unknown>

export interface FunnelTemplateBlockSeed {
  block_type: FunnelRuntimeBlockType
  content: Record<string, unknown>
  settings: Record<string, unknown>
}

export interface FunnelTemplateDefinition {
  id: string
  step: FunnelTemplateStep
  name: Record<FunnelTemplateLanguage, string>
  description: Record<FunnelTemplateLanguage, string>
  theme: FunnelTemplateTheme
  blocks: Record<FunnelTemplateLanguage, readonly FunnelTemplateBlockSeed[]>
}

const theme = (
  background: string,
  panel: string,
  border: string,
  radius = 24,
): FunnelTemplateTheme => ({
  background_type: 'color',
  background_color: background,
  content_width: 800,
  content_panel_enabled: true,
  content_background_color: panel,
  content_border_enabled: true,
  content_border_color: border,
  content_border_width: 1,
  content_border_radius: radius,
  content_shadow: 'medium',
})

const block = (
  block_type: FunnelTemplateBlockSeed['block_type'],
  content: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): FunnelTemplateBlockSeed => ({ block_type, content, settings })

const localizedBlocks = (
  lt: readonly FunnelTemplateBlockSeed[],
  en: readonly FunnelTemplateBlockSeed[],
  ru: readonly FunnelTemplateBlockSeed[],
): Record<FunnelTemplateLanguage, readonly FunnelTemplateBlockSeed[]> => ({
  lt,
  en,
  ru,
})

const registration = (
  hero: Record<FunnelTemplateLanguage, [string, string]>,
  benefits: Record<FunnelTemplateLanguage, string[]>,
  button: Record<FunnelTemplateLanguage, string>,
) =>
  localizedBlocks(
    [
      block(
        'webinar_hero',
        {
          eyebrow: 'Nemokamas internetinis seminaras',
          title: hero.lt[0],
          subtitle: hero.lt[1],
          badge: 'Nemokamai',
          buttonText: button.lt,
          buttonAction: 'registration',
          showCountdown: true,
        },
        { column_span: 12, width_mode: 'viewport' },
      ),
      block('benefits', {
        title: 'Šio webinaro metu sužinosite',
        items: benefits.lt,
      }),
      block('registration_form', {
        title: 'Rezervuokite savo vietą',
        buttonText: button.lt,
        collectName: true,
        registrationMethod: 'inherit',
        successMessage: 'Registracija sėkminga! Patikrinkite savo el. paštą.',
      }),
    ],
    [
      block(
        'webinar_hero',
        {
          eyebrow: 'Free webinar',
          title: hero.en[0],
          subtitle: hero.en[1],
          badge: 'Free',
          buttonText: button.en,
          buttonAction: 'registration',
          showCountdown: true,
        },
        { column_span: 12, width_mode: 'viewport' },
      ),
      block('benefits', {
        title: 'During this webinar you will learn',
        items: benefits.en,
      }),
      block('registration_form', {
        title: 'Reserve your seat',
        buttonText: button.en,
        collectName: true,
        registrationMethod: 'inherit',
        successMessage: 'You are registered! Check your inbox for details.',
      }),
    ],
    [
      block(
        'webinar_hero',
        {
          eyebrow: 'Бесплатный вебинар',
          title: hero.ru[0],
          subtitle: hero.ru[1],
          badge: 'Бесплатно',
          buttonText: button.ru,
          buttonAction: 'registration',
          showCountdown: true,
        },
        { column_span: 12, width_mode: 'viewport' },
      ),
      block('benefits', {
        title: 'На этом вебинаре вы узнаете',
        items: benefits.ru,
      }),
      block('registration_form', {
        title: 'Забронируйте место',
        buttonText: button.ru,
        collectName: true,
        registrationMethod: 'inherit',
        successMessage: 'Вы зарегистрированы! Проверьте почту.',
      }),
    ],
  )

const waiting = (
  title: Record<FunnelTemplateLanguage, string>,
  text: Record<FunnelTemplateLanguage, string>,
  accent: Record<FunnelTemplateLanguage, string>,
) =>
  localizedBlocks(
    [
      block('hero', { title: title.lt, subtitle: text.lt, align: 'center' }),
      block('waiting_room_system', {
        title: title.lt,
        message: text.lt,
        system: true,
      }),
      block('countdown', { mode: 'fixed', target: null, style: 'cards' }),
      block('text', { text: accent.lt }),
    ],
    [
      block('hero', { title: title.en, subtitle: text.en, align: 'center' }),
      block('waiting_room_system', {
        title: title.en,
        message: text.en,
        system: true,
      }),
      block('countdown', { mode: 'fixed', target: null, style: 'cards' }),
      block('text', { text: accent.en }),
    ],
    [
      block('hero', { title: title.ru, subtitle: text.ru, align: 'center' }),
      block('waiting_room_system', {
        title: title.ru,
        message: text.ru,
        system: true,
      }),
      block('countdown', { mode: 'fixed', target: null, style: 'cards' }),
      block('text', { text: accent.ru }),
    ],
  )

export interface OfferTier {
  id: 'basic' | 'standard' | 'pro'
  name: string
  price: string
  description: string
  features: string[]
  featured: boolean
  currency: string
  oldPrice: string
  badge: string
  buttonText: string
  buttonUrl: string
}

const offer = (
  heading: Record<FunnelTemplateLanguage, [string, string]>,
  prices: [string, string, string],
  composition: 'long' | 'video' | 'product' | 'pricing',
) => {
  const tiers = (language: FunnelTemplateLanguage): OfferTier[] => {
    const copy = {
      lt: {
        names: ['Basic', 'Standard', 'Pro'],
        descriptions: [
          'Tvirtai pradžiai',
          'Geriausias pasirinkimas augimui',
          'Maksimaliam rezultatui',
        ],
        features: [
          ['Pagrindinė programa', 'Praktinės užduotys', 'Prieiga 3 mėnesiams'],
          ['Viskas iš Basic', 'Papildomi šablonai', 'Grupinė klausimų sesija'],
          ['Viskas iš Standard', 'Asmeninė konsultacija', 'Prieiga 12 mėnesių'],
        ],
        cta: 'Pasirinkti planą',
      },
      en: {
        names: ['Basic', 'Standard', 'Pro'],
        descriptions: [
          'A strong start',
          'Best value for growth',
          'Maximum results',
        ],
        features: [
          ['Core program', 'Practical exercises', '3 months access'],
          ['Everything in Basic', 'Bonus templates', 'Group Q&A session'],
          [
            'Everything in Standard',
            'Private consultation',
            '12 months access',
          ],
        ],
        cta: 'Choose plan',
      },
      ru: {
        names: ['Basic', 'Standard', 'Pro'],
        descriptions: [
          'Уверенный старт',
          'Лучший выбор для роста',
          'Максимальный результат',
        ],
        features: [
          ['Основная программа', 'Практические задания', 'Доступ на 3 месяца'],
          [
            'Всё из Basic',
            'Дополнительные шаблоны',
            'Групповая сессия вопросов',
          ],
          ['Всё из Standard', 'Личная консультация', 'Доступ на 12 месяцев'],
        ],
        cta: 'Выбрать план',
      },
    }[language]
    return (['basic', 'standard', 'pro'] as const).map((id, index) => ({
      id,
      name: copy.names[index],
      price: prices[index],
      description: copy.descriptions[index],
      features: copy.features[index],
      featured: id === 'standard',
      currency: 'EUR',
      oldPrice: '',
      badge:
        id === 'standard'
          ? language === 'lt'
            ? 'Rekomenduojamas'
            : language === 'ru'
              ? 'Рекомендуем'
              : 'Recommended'
          : '',
      buttonText: copy.cta,
      buttonUrl: '#',
    }))
  }
  const compositionBlock = (language: FunnelTemplateLanguage) => {
    const copy = {
      lt: {
        long: [
          'Kodėl verta tęsti dabar?',
          'Nuosekli programa, praktika ir palaikymas padės žinias paversti rezultatu.',
        ],
        video: [
          'Peržiūrėkite pasiūlymo pristatymą',
          'Sužinokite, kuris paketas geriausiai atitinka jūsų tikslą.',
        ],
        product: [
          'Produkto pristatymas',
          'Visa metodika, įrankiai ir palaikymas vienoje programoje.',
        ],
      },
      en: {
        long: [
          'Why continue now?',
          'A clear program, practice, and support turn knowledge into results.',
        ],
        video: [
          'Watch the offer presentation',
          'See which package best matches your goal.',
        ],
        product: [
          'Product showcase',
          'The complete method, tools, and support in one program.',
        ],
      },
      ru: {
        long: [
          'Почему стоит продолжить сейчас?',
          'Программа, практика и поддержка помогут превратить знания в результат.',
        ],
        video: [
          'Посмотрите презентацию предложения',
          'Узнайте, какой пакет лучше соответствует вашей цели.',
        ],
        product: [
          'Презентация продукта',
          'Методика, инструменты и поддержка в одной программе.',
        ],
      },
    }[language]
    if (composition === 'video') {
      return block('video', {
        url: '',
        provider: 'custom',
        title: copy.video[0],
      })
    }
    if (composition === 'product') {
      return block('image', {
        url: '',
        alt: copy.product[0],
        widthDesktop: 75,
        widthMobile: 100,
      })
    }
    if (composition === 'long') {
      return block('text', {
        text: `<h2>${copy.long[0]}</h2><p>${copy.long[1]}</p>`,
      })
    }
    return null
  }
  const faq = {
    lt: {
      question: 'Ar galiu persigalvoti?',
      answer: 'Taip, galioja 14 dienų pinigų grąžinimo garantija.',
    },
    en: {
      question: 'Can I change my mind?',
      answer: 'Yes, your purchase includes a 14-day money-back guarantee.',
    },
    ru: {
      question: 'Можно ли передумать?',
      answer: 'Да, действует гарантия возврата денег в течение 14 дней.',
    },
  }
  const page = (language: FunnelTemplateLanguage) => {
    const extra = compositionBlock(language)
    return [
      block('hero', {
        title: heading[language][0],
        subtitle: heading[language][1],
        align: 'center',
      }),
      ...(extra ? [extra] : []),
      block('offer', {
        title: heading[language][0],
        mode: 'tiers',
        price: prices[1],
        tiers: tiers(language),
      }),
      block('faq', { items: [faq[language]] }),
    ]
  }
  return localizedBlocks(page('lt'), page('en'), page('ru'))
}

export const FUNNEL_TEMPLATES = [
  {
    id: 'registration-clean',
    step: 'registration',
    name: {
      lt: 'Švari registracija',
      en: 'Clean registration',
      ru: 'Чистая регистрация',
    },
    description: {
      lt: 'Aiški, universali registracijos forma.',
      en: 'A clear, versatile registration page.',
      ru: 'Понятная универсальная страница регистрации.',
    },
    theme: theme('#f8fafc', '#ffffff', '#e2e8f0'),
    blocks: registration(
      {
        lt: [
          'Paverskite žinias rezultatais',
          'Praktinis seminaras su aiškiu veiksmų planu.',
        ],
        en: [
          'Turn knowledge into results',
          'A practical webinar with a clear action plan.',
        ],
        ru: [
          'Превратите знания в результат',
          'Практический вебинар с понятным планом действий.',
        ],
      },
      {
        lt: ['Aiškūs žingsniai', 'Praktiniai pavyzdžiai', 'Atsakymai gyvai'],
        en: ['Clear next steps', 'Practical examples', 'Live answers'],
        ru: ['Понятные шаги', 'Практические примеры', 'Ответы в прямом эфире'],
      },
      {
        lt: 'Registruotis nemokamai',
        en: 'Register for free',
        ru: 'Зарегистрироваться бесплатно',
      },
    ),
  },
  {
    id: 'registration-bold',
    step: 'registration',
    name: { lt: 'Ryški pradžia', en: 'Bold launch', ru: 'Яркий старт' },
    description: {
      lt: 'Energinga registracija naujam pasiūlymui.',
      en: 'An energetic page for a new launch.',
      ru: 'Энергичная страница для нового запуска.',
    },
    theme: theme('#312e81', '#ffffff', '#c4b5fd', 32),
    blocks: registration(
      {
        lt: [
          'Jūsų proveržis prasideda čia',
          'Prisijunkite ir atraskite sistemą, kuri taupo laiką.',
        ],
        en: [
          'Your breakthrough starts here',
          'Join us and discover a system that saves time.',
        ],
        ru: [
          'Ваш прорыв начинается здесь',
          'Откройте систему, которая экономит время.',
        ],
      },
      {
        lt: [
          'Veikianti sistema',
          'Greitai pritaikomi metodai',
          'Gyva demonstracija',
        ],
        en: ['A proven system', 'Fast-to-apply methods', 'Live demonstration'],
        ru: ['Проверенная система', 'Быстрые методы', 'Живая демонстрация'],
      },
      { lt: 'Noriu dalyvauti', en: 'Save my seat', ru: 'Занять место' },
    ),
  },
  {
    id: 'registration-expert',
    step: 'registration',
    name: {
      lt: 'Eksperto seminaras',
      en: 'Expert webinar',
      ru: 'Экспертный вебинар',
    },
    description: {
      lt: 'Pasitikėjimą kuriantis eksperto pristatymas.',
      en: 'An authority-led webinar registration page.',
      ru: 'Страница регистрации с акцентом на экспертность.',
    },
    theme: theme('#ecfeff', '#ffffff', '#a5f3fc'),
    blocks: registration(
      {
        lt: [
          'Eksperto metodas geresniems sprendimams',
          'Sužinokite, kas iš tiesų veikia šiandien.',
        ],
        en: [
          'The expert method for better decisions',
          'Learn what actually works today.',
        ],
        ru: [
          'Экспертный метод для лучших решений',
          'Узнайте, что действительно работает сегодня.',
        ],
      },
      {
        lt: [
          'Naujausios įžvalgos',
          'Realių atvejų analizė',
          'Klausimai ekspertui',
        ],
        en: ['Current insights', 'Real case studies', 'Expert Q&A'],
        ru: ['Актуальные знания', 'Разбор реальных кейсов', 'Вопросы эксперту'],
      },
      {
        lt: 'Rezervuoti vietą',
        en: 'Reserve my seat',
        ru: 'Забронировать место',
      },
    ),
  },
  {
    id: 'registration-minimal',
    step: 'registration',
    name: { lt: 'Minimalistinė', en: 'Minimal', ru: 'Минимализм' },
    description: {
      lt: 'Trumpa registracija be blaškančių elementų.',
      en: 'A concise, distraction-free registration page.',
      ru: 'Краткая регистрация без отвлекающих элементов.',
    },
    theme: theme('#ffffff', '#ffffff', '#f1f5f9', 12),
    blocks: registration(
      {
        lt: [
          'Viena valanda. Vienas aiškus planas.',
          'Prisijunkite prie koncentruotos praktinės sesijos.',
        ],
        en: ['One hour. One clear plan.', 'Join a focused, practical session.'],
        ru: [
          'Один час. Один чёткий план.',
          'Присоединяйтесь к практической сессии.',
        ],
      },
      {
        lt: [
          'Be teorijos pertekliaus',
          'Aiškus veiksmų planas',
          'Nemokamas dalyvavimas',
        ],
        en: ['No unnecessary theory', 'A clear action plan', 'Free to attend'],
        ru: ['Без лишней теории', 'Чёткий план действий', 'Бесплатное участие'],
      },
      { lt: 'Prisijungti', en: 'Join the webinar', ru: 'Присоединиться' },
    ),
  },
  {
    id: 'waiting-calm',
    step: 'waiting_room',
    name: {
      lt: 'Ramus laukimas',
      en: 'Calm waiting room',
      ru: 'Спокойное ожидание',
    },
    description: {
      lt: 'Švari laukimo erdvė prieš transliaciją.',
      en: 'A clean space before the broadcast.',
      ru: 'Спокойное пространство перед эфиром.',
    },
    theme: theme('#eff6ff', '#ffffff', '#bfdbfe'),
    blocks: waiting(
      {
        lt: 'Netrukus pradedame',
        en: 'We are starting soon',
        ru: 'Скоро начинаем',
      },
      {
        lt: 'Likite šiame puslapyje — transliacija prasidės automatiškai.',
        en: 'Stay on this page—the broadcast will begin automatically.',
        ru: 'Оставайтесь на странице — трансляция начнётся автоматически.',
      },
      {
        lt: 'Kol laukiate, pasiruoškite užrašus ir išjunkite trukdžius.',
        en: 'While you wait, grab your notes and remove distractions.',
        ru: 'Пока ждёте, приготовьте заметки и уберите отвлекающие факторы.',
      },
    ),
  },
  {
    id: 'waiting-countdown',
    step: 'waiting_room',
    name: {
      lt: 'Didysis atgalinis laikas',
      en: 'Countdown focus',
      ru: 'Фокус на таймере',
    },
    description: {
      lt: 'Laukimo puslapis su ryškiu laiko akcentu.',
      en: 'A waiting page centered on the countdown.',
      ru: 'Страница ожидания с акцентом на таймер.',
    },
    theme: theme('#0f172a', '#f8fafc', '#475569', 28),
    blocks: waiting(
      {
        lt: 'Tiesioginis eteris jau netrukus',
        en: 'Live broadcast begins shortly',
        ru: 'Прямой эфир начнётся совсем скоро',
      },
      {
        lt: 'Jūsų vieta rezervuota. Langą palikite atidarytą.',
        en: 'Your seat is reserved. Keep this window open.',
        ru: 'Ваше место забронировано. Не закрывайте окно.',
      },
      {
        lt: 'Pakvieskite prisijungti kolegą — kartu pritaikyti lengviau.',
        en: 'Invite a colleague—it is easier to apply together.',
        ru: 'Пригласите коллегу — применять знания вместе проще.',
      },
    ),
  },
  {
    id: 'waiting-community',
    step: 'waiting_room',
    name: {
      lt: 'Bendruomenės laukimas',
      en: 'Community welcome',
      ru: 'Встреча сообщества',
    },
    description: {
      lt: 'Šiltas pasitikimas dalyviams.',
      en: 'A warm welcome for attendees.',
      ru: 'Тёплая встреча участников.',
    },
    theme: theme('#fff7ed', '#ffffff', '#fed7aa'),
    blocks: waiting(
      {
        lt: 'Smagu, kad esate čia',
        en: 'Great to have you here',
        ru: 'Рады видеть вас здесь',
      },
      {
        lt: 'Seminaras netrukus prasidės. Sistema jus įleis automatiškai.',
        en: 'The webinar starts soon. You will be admitted automatically.',
        ru: 'Вебинар скоро начнётся. Система подключит вас автоматически.',
      },
      {
        lt: 'Pagalvokite, į kokį svarbiausią klausimą norite atsakymo.',
        en: 'Think of the one question you most want answered.',
        ru: 'Подумайте, на какой главный вопрос хотите получить ответ.',
      },
    ),
  },
  {
    id: 'waiting-premium',
    step: 'waiting_room',
    name: {
      lt: 'Premium laukimas',
      en: 'Premium waiting room',
      ru: 'Премиум ожидание',
    },
    description: {
      lt: 'Elegantiška erdvė išskirtinei sesijai.',
      en: 'An elegant space for an exclusive session.',
      ru: 'Элегантное пространство для особой сессии.',
    },
    theme: theme('#18181b', '#fafafa', '#d4af37', 16),
    blocks: waiting(
      {
        lt: 'Jūsų privati sesija ruošiama',
        en: 'Your private session is being prepared',
        ru: 'Ваша закрытая сессия готовится',
      },
      {
        lt: 'Likite čia. Prieiga bus atidaryta vos prasidėjus sesijai.',
        en: 'Stay here. Access opens as soon as the session begins.',
        ru: 'Оставайтесь здесь. Доступ откроется с началом сессии.',
      },
      {
        lt: 'Skirkite akimirką savo pagrindiniam tikslui užrašyti.',
        en: 'Take a moment to write down your primary goal.',
        ru: 'Запишите свою главную цель перед началом.',
      },
    ),
  },
  {
    id: 'offer-course',
    step: 'offer',
    name: {
      lt: 'Ilgas pardavimo puslapis',
      en: 'Long-form sales page',
      ru: 'Длинная страница продаж',
    },
    description: {
      lt: 'Trijų lygių mokymų pasiūlymas.',
      en: 'A three-tier education offer.',
      ru: 'Трёхуровневое предложение обучения.',
    },
    theme: theme('#f8fafc', '#ffffff', '#cbd5e1'),
    blocks: offer(
      {
        lt: [
          'Tęskite savo pažangą',
          'Pasirinkite palaikymo lygį ir pradėkite šiandien.',
        ],
        en: [
          'Keep your momentum',
          'Choose your level of support and start today.',
        ],
        ru: [
          'Продолжайте двигаться вперёд',
          'Выберите уровень поддержки и начните сегодня.',
        ],
      },
      ['€49', '€99', '€249'],
      'long',
    ),
  },
  {
    id: 'offer-consulting',
    step: 'offer',
    name: {
      lt: 'Video pasiūlymas',
      en: 'Video offer',
      ru: 'Видео-предложение',
    },
    description: {
      lt: 'Paslaugų paketai skirtingiems poreikiams.',
      en: 'Service packages for different needs.',
      ru: 'Пакеты услуг для разных задач.',
    },
    theme: theme('#eef2ff', '#ffffff', '#c7d2fe', 28),
    blocks: offer(
      {
        lt: [
          'Greitesni rezultatai su ekspertu',
          'Pasirinkite paketą pagal savo tikslą.',
        ],
        en: [
          'Get results faster with an expert',
          'Choose the package that matches your goal.',
        ],
        ru: [
          'Быстрее к результату с экспертом',
          'Выберите пакет под свою цель.',
        ],
      },
      ['€190', '€490', '€990'],
      'video',
    ),
  },
  {
    id: 'offer-membership',
    step: 'offer',
    name: {
      lt: 'Produkto pristatymas',
      en: 'Product showcase',
      ru: 'Презентация продукта',
    },
    description: {
      lt: 'Aiškūs mėnesinės narystės lygiai.',
      en: 'Clear monthly membership levels.',
      ru: 'Понятные уровни ежемесячной подписки.',
    },
    theme: theme('#f0fdf4', '#ffffff', '#bbf7d0'),
    blocks: offer(
      {
        lt: [
          'Auginkite rezultatą kiekvieną mėnesį',
          'Bendruomenė, įrankiai ir palaikymas vienoje vietoje.',
        ],
        en: [
          'Grow your results every month',
          'Community, tools, and support in one place.',
        ],
        ru: [
          'Улучшайте результат каждый месяц',
          'Сообщество, инструменты и поддержка в одном месте.',
        ],
      },
      ['€19/mėn.', '€49/mėn.', '€99/mėn.'],
      'product',
    ),
  },
  {
    id: 'offer-premium',
    step: 'offer',
    name: {
      lt: 'Kainodaros palyginimas',
      en: 'Pricing comparison',
      ru: 'Сравнение тарифов',
    },
    description: {
      lt: 'Aukštos vertės transformacijos paketai.',
      en: 'High-value transformation packages.',
      ru: 'Пакеты трансформации высокой ценности.',
    },
    theme: theme('#1c1917', '#fafaf9', '#d6d3d1', 20),
    blocks: offer(
      {
        lt: [
          'Pasirinkite savo transformacijos lygį',
          'Ribotos vietos tiems, kurie pasiruošę veikti.',
        ],
        en: [
          'Choose your level of transformation',
          'Limited places for those ready to act.',
        ],
        ru: [
          'Выберите уровень трансформации',
          'Количество мест для готовых действовать ограничено.',
        ],
      },
      ['€490', '€1,490', '€3,900'],
      'pricing',
    ),
  },
] as const satisfies readonly FunnelTemplateDefinition[]

export type FunnelTemplateId = (typeof FUNNEL_TEMPLATES)[number]['id']

export function normalizeFunnelTemplateLanguage(
  language: string | null | undefined,
): FunnelTemplateLanguage {
  const base = language?.toLowerCase().split('-')[0]
  return base === 'lt' || base === 'ru' ? base : 'en'
}

export function getFunnelTemplates(step?: FunnelTemplateStep) {
  return step
    ? FUNNEL_TEMPLATES.filter((template) => template.step === step)
    : [...FUNNEL_TEMPLATES]
}

export function getFunnelTemplate(id: FunnelTemplateId) {
  return FUNNEL_TEMPLATES.find((template) => template.id === id)
}

export function localizeFunnelTemplate(
  template: FunnelTemplateDefinition,
  language: string | null | undefined,
) {
  const normalized = normalizeFunnelTemplateLanguage(language)
  return {
    id: template.id,
    step: template.step,
    name: template.name[normalized],
    description: template.description[normalized],
    theme: template.theme,
    blocks: template.blocks[normalized],
  }
}
