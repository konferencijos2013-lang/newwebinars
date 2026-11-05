import { describe, expect, it } from 'vitest'
import { formatNextReplay, formatSessionStart } from './nextReplay'

const session = '2026-11-01T18:30:00.000Z'

describe('formatNextReplay', () => {
  it('writes the session start in the webinar timezone', () => {
    const label = formatSessionStart(
      '2026-11-01T18:30:00.000Z',
      'Europe/Vilnius',
      'lt',
    )
    expect(label).toContain('20:30')
    expect(label).toContain('2026')
  })

  it('offers tomorrow at the same time for a daily automated webinar', () => {
    expect(
      formatNextReplay({
        webinarType: 'automated',
        scheduleType: 'just_in_time',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
      }),
    ).toBe('rytoj 20:30')
  })

  it('says tomorrow when the next scheduled weekday is the following day', () => {
    expect(
      formatNextReplay({
        webinarType: 'automated',
        scheduleType: 'recurring',
        daysOfWeek: [1],
        time: '20:30',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
      }),
    ).toBe('rytoj 20:30')
  })

  it('names the next time in the webinar language', () => {
    expect(
      formatNextReplay({
        webinarType: 'automated',
        scheduleType: 'recurring',
        daysOfWeek: [3],
        time: '20:30',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
        language: 'en',
      }),
    ).toBe('Wednesday 20:30')
    expect(
      formatNextReplay({
        webinarType: 'automated',
        scheduleType: 'just_in_time',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
        language: 'ru',
      }),
    ).toBe('завтра 20:30')
  })

  it('uses the next scheduled weekday when the webinar does not run every day', () => {
    expect(
      formatNextReplay({
        webinarType: 'automated',
        scheduleType: 'recurring',
        daysOfWeek: [3],
        time: '20:30',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
      }),
    ).toBe('trečiadienį 20:30')
  })

  it('uses a real later session for a live webinar', () => {
    expect(
      formatNextReplay({
        webinarType: 'live',
        sessionStartsAt: session,
        nextFixedStart: '2026-11-05T16:00:00.000Z',
        timezone: 'Europe/Vilnius',
      }),
    ).toBe('2026-11-05 18:00')
  })

  it('leaves the missed-session letter unsent when a live webinar has no next date', () => {
    expect(
      formatNextReplay({
        webinarType: 'live',
        sessionStartsAt: session,
        timezone: 'Europe/Vilnius',
      }),
    ).toBeNull()
  })
})
