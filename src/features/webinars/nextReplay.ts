const WEEKDAYS = {
  lt: [
    'pirmadienį',
    'antradienį',
    'trečiadienį',
    'ketvirtadienį',
    'penktadienį',
    'šeštadienį',
    'sekmadienį',
  ],
  en: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  ru: [
    'в понедельник',
    'во вторник',
    'в среду',
    'в четверг',
    'в пятницу',
    'в субботу',
    'в воскресенье',
  ],
} as const

const TOMORROW = {
  lt: 'rytoj',
  en: 'tomorrow',
  ru: 'завтра',
} as const

export type ReplayLanguage = keyof typeof TOMORROW

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

export type NextReplayInput = {
  webinarType: 'live' | 'automated'
  scheduleType?: string | null
  daysOfWeek?: number[] | null
  time?: string | null
  timezone?: string | null
  sessionStartsAt?: string | null
  nextFixedStart?: string | null
  language?: ReplayLanguage | null
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: read('hour'),
    minute: read('minute'),
    dow: WEEKDAY_INDEX[read('weekday')] ?? 1,
    key: `${read('year')}-${read('month')}-${read('day')}`,
  }
}

function clockOf(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone)
  return `${parts.hour}:${parts.minute}`
}

function formatFixed(
  value: string,
  sessionStartsAt: string | null | undefined,
  timeZone: string,
  language: ReplayLanguage,
) {
  const when = new Date(value)
  if (Number.isNaN(when.getTime())) return null
  const parts = zonedParts(when, timeZone)
  const clock = `${parts.hour}:${parts.minute}`
  if (sessionStartsAt) {
    const session = zonedParts(new Date(sessionStartsAt), timeZone)
    const tomorrow = zonedParts(
      new Date(Date.UTC(session.year, session.month - 1, session.day + 1, 12)),
      timeZone,
    )
    if (parts.key === tomorrow.key) return `${TOMORROW[language]} ${clock}`
  }
  return `${parts.key} ${clock}`
}

export function formatNextReplay(input: NextReplayInput) {
  const timeZone = input.timezone || 'Europe/Vilnius'
  const language = input.language === 'en' || input.language === 'ru' ? input.language : 'lt'
  if (input.nextFixedStart) {
    return formatFixed(input.nextFixedStart, input.sessionStartsAt, timeZone, language)
  }
  if (input.webinarType !== 'automated' || !input.sessionStartsAt) return null

  const session = new Date(input.sessionStartsAt)
  if (Number.isNaN(session.getTime())) return null
  const start = zonedParts(session, timeZone)
  const clock = input.time || `${start.hour}:${start.minute}`
  const days =
    input.daysOfWeek && input.daysOfWeek.length > 0
      ? input.daysOfWeek
      : [1, 2, 3, 4, 5, 6, 7]

  for (let offset = 1; offset <= 8; offset += 1) {
    const probe = zonedParts(
      new Date(Date.UTC(start.year, start.month - 1, start.day + offset, 12)),
      timeZone,
    )
    if (!days.includes(probe.dow)) continue
    if (offset === 1) return `${TOMORROW[language]} ${clock}`
    return `${WEEKDAYS[language][probe.dow - 1]} ${clock}`
  }
  return null
}

export function clockLabel(value: string, timeZone = 'Europe/Vilnius') {
  return clockOf(new Date(value), timeZone)
}
