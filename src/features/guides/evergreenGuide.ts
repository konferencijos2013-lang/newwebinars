import type { SeoLocale } from '../seo/marketingPages.ts'

export type GuideDiagram = 'process' | 'compare' | 'funnel'

export type GuideSection = {
  heading: string
  paragraphs: string[]
  bullets?: string[]
  diagram?: GuideDiagram
}

export type GuideVisuals = {
  processLabel: string
  process: { title: string; text: string }[]
  compareLabel: string
  compareHeaders: [string, string, string]
  compareRows: { aspect: string; live: string; evergreen: string }[]
  funnelLabel: string
  funnel: { title: string; text: string }[]
}

export type GuideTranslation = {
  slug: string
  title: string
  description: string
  excerpt: string
  sections: GuideSection[]
  visuals: GuideVisuals
}

export const GUIDE_PUBLISHED = '2026-11-05'

export const GUIDE_INDEX: Record<
  SeoLocale,
  { title: string; description: string; intro: string }
> = {
  en: {
    title: 'Guides',
    description:
      'Practical guides to evergreen webinars: how a recording sells on a schedule, how chat follows the video, and when a live session is the better choice.',
    intro:
      'Short guides about running a webinar from one recording. No promised conversion rates. Each page explains one decision.',
  },
  lt: {
    title: 'Gidas',
    description:
      'Praktiniai gidai apie evergreen webinarus: kaip įrašas parduoda pagal grafiką, kaip pokalbis seka vaizdą ir kada geriau gyvas vebinaras. Be išgalvotų skaičių.',
    intro:
      'Trumpi gidai apie vebinarą iš vieno įrašo. Jokių pažadėtų konversijos skaičių. Kiekvienas puslapis paaiškina vieną sprendimą.',
  },
  ru: {
    title: 'Гид',
    description:
      'Практические гиды об evergreen-вебинарах: как запись продаёт по расписанию, как чат идёт по видео и когда лучше живой эфир. Без обещаний. Читайте гид.',
    intro:
      'Короткие гиды о вебинаре из одной записи. Без обещанных процентов конверсии. Каждая страница объясняет одно решение.',
  },
}

const en: GuideTranslation = {
  slug: 'evergreen-webinar',
  title: 'What an evergreen webinar is and why it can sell without you',
  description:
    'An evergreen webinar replays one recording on a schedule. Learn how it differs from a live webinar and when the recording is the better choice. Free guide.',
  excerpt:
    'One recording, a start time, and a room that talks along the video. Here is what that actually means, and when a live session is still better.',
  sections: [
    {
      heading: 'What an evergreen webinar is',
      paragraphs: [
        'An evergreen webinar is a recorded session that can start again without the host sitting in the room. People register, arrive at a set time or just after they sign up, and watch the same recording.',
        'The word evergreen means the session does not expire after the first broadcast. The recording stays available for the next group. It is not a file dumped on a page. It still has a start, a room, and an end.',
      ],
    },
    {
      heading: 'How it differs from a replay link',
      paragraphs: [
        'A replay link is a video someone can open whenever they like. An automated webinar adds the pieces a live room has: registration, a waiting room, chat placed on the video timeline, and an offer that appears at a chosen minute.',
        'Those pieces matter because a bare video rarely creates a moment to decide. A start time and a timed offer give the recording a shape.',
      ],
    },
    {
      heading: 'Why it can sell when you are not in the room',
      paragraphs: [
        'The sale can repeat because the work of presenting happened once. The room then does three jobs you would otherwise do live: it starts on time, the chat follows the video, and the offer appears when you planned it.',
        'Payment goes to the host, through the host’s own Paysera, Stripe, or PayPal account. The platform does not keep the product payment. None of this guarantees a sale. A weak offer stays weak when it is automated.',
      ],
      bullets: [
        'Registration gives people a time to show up.',
        'Chat on the timeline keeps the room from feeling empty.',
        'The offer appears at a minute you choose, not at a random scroll.',
        'Reminders can go out before the start, when it has started, and after it ends, in Lithuanian, English, or Russian.',
      ],
    },
    {
      heading: 'When a live webinar is the better choice',
      paragraphs: [
        'Use a live session when the value is your answers in the moment. A product that changes every week, a small group that needs a conversation, or a first talk you have never given before all fit a live room better.',
        'An evergreen webinar fits a talk you have already given, with a clear offer and questions you can answer in the recording itself.',
      ],
    },
    {
      heading: 'Three steps',
      paragraphs: [
        'The whole setup is the same shape every time. You prepare the recording once, choose when it plays, and let the room run.',
      ],
      diagram: 'process',
    },
    {
      heading: 'Evergreen and live, side by side',
      paragraphs: [
        'The table is about your time, not about which format converts better. That depends on the talk and the offer. Measure it. Do not assume it.',
      ],
      diagram: 'compare',
    },
    {
      heading: 'Where people leave',
      paragraphs: [
        'People drop off between registering, watching, and paying. A reminder brings some of them to the room. A chat script keeps some of them watching. A clear offer minute gives the ones who stayed a way to pay.',
        'Analytics shows registrations, who entered the room, watch time, offer clicks, and payments. Those counts, and the percent of registrations each one represents, tell you where the room leaks. They do not invent a benchmark you should hit.',
      ],
      diagram: 'funnel',
    },
  ],
  visuals: {
    processLabel: 'Three steps: upload the recording, set the time, start the sale.',
    process: [
      { title: 'Upload the recording', text: 'The talk already exists. The chat script can be drafted from it.' },
      { title: 'Set the time', text: 'A schedule, chosen days, or a start after someone registers.' },
      { title: 'Start the sale', text: 'The room runs, the offer appears on time, payment goes to you.' },
    ],
    compareLabel: 'Live webinar compared with an evergreen webinar.',
    compareHeaders: ['', 'Live', 'Evergreen'],
    compareRows: [
      { aspect: 'When you present', live: 'You are in the room', evergreen: 'You present once, on the recording' },
      { aspect: 'How often it can run', live: 'Once, unless you repeat it', evergreen: 'Again, on a schedule or after registration' },
      { aspect: 'Your time', live: 'Every session', evergreen: 'The first recording, then the room' },
      { aspect: 'Chat', live: 'You type as people talk', evergreen: 'Messages sit on the video timeline' },
      { aspect: 'Questions', live: 'You can answer live', evergreen: 'Answers have to be in the recording' },
    ],
    funnelLabel: 'Registration, watching with chat, then payment.',
    funnel: [
      { title: 'Registration', text: 'Someone leaves an email or joins from Telegram and gets a start time.' },
      { title: 'Watching', text: 'They enter the room. Chat follows the video. Some leave here.' },
      { title: 'Payment', text: 'The offer appears at a set minute. They pay the host, or they do not.' },
    ],
  },
}

const lt: GuideTranslation = {
  slug: 'kas-yra-evergreen-webinaras',
  title: 'Kas yra evergreen webinaras ir kodėl jis gali parduoti be jūsų',
  description:
    'Evergreen webinaras vėl rodo tą patį įrašą be jūsų salėje. Sužinokite, kuo jis skiriasi nuo gyvo vebinaro ir kada jį rinktis. Nemokamas gidas. Pradėkite.',
  excerpt:
    'Vienas įrašas, pradžios laikas ir kambarys, kuris kalba pagal vaizdą. Čia paaiškinta, ką tai reiškia ir kada vis dar geriau gyvas vebinaras.',
  sections: [
    {
      heading: 'Kas yra evergreen webinaras',
      paragraphs: [
        'Evergreen webinaras yra įrašytas užsiėmimas, kuris gali prasidėti iš naujo, kai vedėjo salėje nėra. Žmonės užsiregistruoja, ateina nustatytu laiku arba iškart po registracijos ir žiūri tą patį įrašą.',
        'Žodis evergreen reiškia, kad užsiėmimas nesibaigia po pirmos transliacijos. Įrašas lieka kitai grupei. Tai nėra failas, numestas į puslapį. Jis vis tiek turi pradžią, kambarį ir pabaigą.',
      ],
    },
    {
      heading: 'Kuo jis skiriasi nuo įrašo nuorodos',
      paragraphs: [
        'Įrašo nuoroda yra vaizdas, kurį žmogus atidaro kada nori. Automatinis webinaras prideda tai, ką turi gyva salė: registraciją, laukiamąjį, pokalbį pagal vaizdo minutes ir pasiūlymą, kuris pasirodo pasirinktą minutę.',
        'Šios dalys svarbios, nes plikas vaizdas retai sukuria akimirką apsispręsti. Pradžios laikas ir pasiūlymas laiku suteikia įrašui formą.',
      ],
    },
    {
      heading: 'Kodėl jis gali parduoti, kai jūsų nėra salėje',
      paragraphs: [
        'Pardavimas gali kartotis, nes pristatymo darbas jau padarytas. Tada kambarys atlieka tris darbus, kuriuos kitaip darytumėte gyvai: prasideda laiku, pokalbis seka vaizdą, o pasiūlymas pasirodo tada, kai suplanavote.',
        'Mokėjimas eina vedėjui, į jo paties Paysera, Stripe arba PayPal sąskaitą. Platforma produkto apmokėjimo nepasilieka. Tai nieko negarantuoja. Silpnas pasiūlymas lieka silpnas ir automatizuotas.',
      ],
      bullets: [
        'Registracija duoda žmogui laiką ateiti.',
        'Pokalbis pagal minutes neleidžia salei atrodyti tuščiai.',
        'Pasiūlymas pasirodo jūsų pasirinktą minutę, ne atsitiktinai slenkant.',
        'Priminimai gali išeiti prieš renginį, kai jis prasidėjo, ir po jo. Lietuvių, anglų arba rusų kalba.',
      ],
    },
    {
      heading: 'Kada geriau gyvas webinaras',
      paragraphs: [
        'Rinkitės gyvą užsiėmimą, kai vertė yra jūsų atsakymai tą pačią akimirką. Produktas, kuris keičiasi kas savaitę, maža grupė, kuriai reikia pokalbio, arba pirmas pranešimas, kurio dar nesate sakę, tinka gyvai salei.',
        'Evergreen tinka kalbai, kurią jau esate sakę, su aiškiu pasiūlymu ir atsakymais, kurie telpa pačiame įraše.',
      ],
    },
    {
      heading: 'Trys žingsniai',
      paragraphs: [
        'Paruošimas visada tos pačios formos. Vieną kartą paruošiate įrašą, pasirenkate, kada jis groja, ir leidžiate kambariui veikti.',
      ],
      diagram: 'process',
    },
    {
      heading: 'Evergreen ir gyvas vebinaras greta',
      paragraphs: [
        'Lentelė yra apie jūsų laiką, ne apie tai, kuris formatas parduoda geriau. Tai priklauso nuo kalbos ir pasiūlymo. Pamatavę žinosite. Nespėkite iš anksto.',
      ],
      diagram: 'compare',
    },
    {
      heading: 'Kur žmonės išeina',
      paragraphs: [
        'Žmonės išeina tarp registracijos, žiūrėjimo ir mokėjimo. Priminimas dalį jų atveda į kambarį. Pokalbio scenarijus dalį jų išlaiko prie vaizdo. Aiški pasiūlymo minutė duoda likusiems būdą sumokėti.',
        'Analitika rodo registracijas, kas įėjo į kambarį, žiūrėjimo laiką, pasiūlymo paspaudimus ir apmokėjimus. Šie skaičiai ir procentas nuo registracijų parodo, kur kambarys praleidžia žmones. Jie nesukuria normos, kurią turėtumėte pasiekti.',
      ],
      diagram: 'funnel',
    },
  ],
  visuals: {
    processLabel: 'Trys žingsniai: įkeliate įrašą, nustatote laiką, paleidžiate pardavimą.',
    process: [
      { title: 'Įkeliate įrašą', text: 'Kalba jau yra. Pokalbio scenarijų galima paruošti pagal ją.' },
      { title: 'Nustatote laiką', text: 'Grafikas, pasirinktos dienos arba startas po registracijos.' },
      { title: 'Paleidžiate pardavimą', text: 'Kambarys veikia, pasiūlymas pasirodo laiku, mokėjimas eina jums.' },
    ],
    compareLabel: 'Gyvas webinaras palygintas su evergreen webinaru.',
    compareHeaders: ['', 'Gyvas', 'Evergreen'],
    compareRows: [
      { aspect: 'Kada vedate', live: 'Esate salėje', evergreen: 'Vedate vieną kartą, įraše' },
      { aspect: 'Kiek kartų gali vykti', live: 'Vieną, kol nepakartosite', evergreen: 'Vėl, pagal grafiką arba po registracijos' },
      { aspect: 'Jūsų laikas', live: 'Kiekvieną kartą', evergreen: 'Pirmas įrašas, paskui kambarys' },
      { aspect: 'Pokalbis', live: 'Rašote, kai žmonės kalba', evergreen: 'Žinutės stovi ant vaizdo minučių' },
      { aspect: 'Klausimai', live: 'Galite atsakyti gyvai', evergreen: 'Atsakymai turi būti įraše' },
    ],
    funnelLabel: 'Registracija, žiūrėjimas su pokalbiu, tada mokėjimas.',
    funnel: [
      { title: 'Registracija', text: 'Žmogus palieka el. paštą arba ateina iš Telegram ir gauna pradžios laiką.' },
      { title: 'Žiūrėjimas', text: 'Jis įeina į kambarį. Pokalbis seka vaizdą. Dalis išeina čia.' },
      { title: 'Mokėjimas', text: 'Pasiūlymas pasirodo nustatytą minutę. Žmogus sumoka vedėjui arba ne.' },
    ],
  },
}

const ru: GuideTranslation = {
  slug: 'chto-takoe-evergreen-vebinar',
  title: 'Что такое evergreen-вебинар и почему он может продавать без вас',
  description:
    'Evergreen-вебинар снова показывает одну запись без вас в зале. Узнайте, чем он отличается от живого эфира и когда его выбирать. Бесплатный гид. Читайте.',
  excerpt:
    'Одна запись, время старта и зал, который говорит по видео. Здесь разобрано, что это значит и когда живой эфир всё ещё лучше.',
  sections: [
    {
      heading: 'Что такое evergreen-вебинар',
      paragraphs: [
        'Evergreen-вебинар — это записанное занятие, которое может начаться снова, когда ведущего нет в зале. Люди регистрируются, приходят в заданное время или сразу после записи и смотрят одну и ту же запись.',
        'Слово evergreen значит, что занятие не заканчивается после первого эфира. Запись остаётся для следующей группы. Это не файл, брошенный на страницу. У него всё равно есть начало, зал и конец.',
      ],
    },
    {
      heading: 'Чем он отличается от ссылки на запись',
      paragraphs: [
        'Ссылка на запись — это видео, которое человек открывает когда угодно. Автоматический вебинар добавляет то, что есть у живого зала: регистрацию, комнату ожидания, чат по минутам видео и предложение, которое появляется на выбранной минуте.',
        'Эти части важны, потому что голое видео редко создаёт момент решения. Время старта и предложение в срок дают записи форму.',
      ],
    },
    {
      heading: 'Почему он может продавать, когда вас нет в зале',
      paragraphs: [
        'Продажа может повторяться, потому что работа выступления уже сделана. Дальше зал делает три дела, которые иначе вы делали бы вживую: начинается вовремя, чат идёт по видео, а предложение появляется тогда, когда вы его поставили.',
        'Оплата идёт ведущему, на его собственный счёт Paysera, Stripe или PayPal. Платформа оплату продукта не забирает. Это ничего не гарантирует. Слабое предложение остаётся слабым и в автоматическом режиме.',
      ],
      bullets: [
        'Регистрация даёт человеку время прийти.',
        'Чат по минутам не даёт залу казаться пустым.',
        'Предложение появляется на выбранной вами минуте, а не при случайной прокрутке.',
        'Напоминания могут уйти до начала, когда эфир уже идёт, и после него. На литовском, английском или русском.',
      ],
    },
    {
      heading: 'Когда лучше живой вебинар',
      paragraphs: [
        'Выбирайте живой эфир, когда ценность в ваших ответах в ту же минуту. Продукт, который меняется каждую неделю, маленькая группа, которой нужен разговор, или первое выступление, которое вы ещё не давали, лучше проходят вживую.',
        'Evergreen подходит речи, которую вы уже говорили, с ясным предложением и ответами, которые помещаются в самой записи.',
      ],
    },
    {
      heading: 'Три шага',
      paragraphs: [
        'Подготовка всегда одной формы. Один раз готовите запись, выбираете, когда она идёт, и даёте залу работать.',
      ],
      diagram: 'process',
    },
    {
      heading: 'Evergreen и живой вебинар рядом',
      paragraphs: [
        'Таблица про ваше время, а не про то, какой формат продаёт лучше. Это зависит от речи и предложения. Измерьте. Не угадывайте заранее.',
      ],
      diagram: 'compare',
    },
    {
      heading: 'Где люди уходят',
      paragraphs: [
        'Люди уходят между регистрацией, просмотром и оплатой. Напоминание приводит часть из них в зал. Сценарий чата удерживает часть у видео. Ясная минута предложения даёт оставшимся способ заплатить.',
        'Аналитика показывает регистрации, кто вошёл в зал, время просмотра, клики по предложению и оплаты. Эти числа и процент от регистраций показывают, где зал теряет людей. Они не создают норму, которую вы обязаны достичь.',
      ],
      diagram: 'funnel',
    },
  ],
  visuals: {
    processLabel: 'Три шага: загружаете запись, задаёте время, запускаете продажу.',
    process: [
      { title: 'Загружаете запись', text: 'Речь уже есть. Сценарий чата можно подготовить по ней.' },
      { title: 'Задаёте время', text: 'Расписание, выбранные дни или старт после регистрации.' },
      { title: 'Запускаете продажу', text: 'Зал работает, предложение появляется вовремя, оплата идёт вам.' },
    ],
    compareLabel: 'Живой вебинар рядом с evergreen-вебинаром.',
    compareHeaders: ['', 'Живой', 'Evergreen'],
    compareRows: [
      { aspect: 'Когда вы ведёте', live: 'Вы в зале', evergreen: 'Ведёте один раз, в записи' },
      { aspect: 'Сколько раз может идти', live: 'Один, пока не повторите', evergreen: 'Снова, по расписанию или после регистрации' },
      { aspect: 'Ваше время', live: 'Каждый эфир', evergreen: 'Первая запись, потом зал' },
      { aspect: 'Чат', live: 'Пишете, когда люди говорят', evergreen: 'Сообщения стоят на минутах видео' },
      { aspect: 'Вопросы', live: 'Можно ответить вживую', evergreen: 'Ответы должны быть в записи' },
    ],
    funnelLabel: 'Регистрация, просмотр с чатом, затем оплата.',
    funnel: [
      { title: 'Регистрация', text: 'Человек оставляет почту или приходит из Telegram и получает время старта.' },
      { title: 'Просмотр', text: 'Он входит в зал. Чат идёт по видео. Часть уходит здесь.' },
      { title: 'Оплата', text: 'Предложение появляется на заданной минуте. Человек платит ведущему или нет.' },
    ],
  },
}

export const EVERGREEN_GUIDE: Record<SeoLocale, GuideTranslation> = { en, lt, ru }

export function guideArticlePath(locale: SeoLocale) {
  return `/guides/${EVERGREEN_GUIDE[locale].slug}`
}

export function guidePathForLocale(pathname: string, locale: SeoLocale) {
  if (pathname === '/guides') return '/guides'
  const slug = pathname.startsWith('/guides/') ? pathname.slice('/guides/'.length) : ''
  if (!slug || slug.includes('/')) return null
  const known = (Object.keys(EVERGREEN_GUIDE) as SeoLocale[]).some(
    (item) => EVERGREEN_GUIDE[item].slug === slug,
  )
  return known ? guideArticlePath(locale) : null
}
