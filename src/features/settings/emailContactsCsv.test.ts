import { describe, expect, it } from 'vitest'
import {
  emailContactsToCsv,
  parseEmailContactsCsv,
} from './emailContactsCsv'

describe('email contact csv', () => {
  it('reads a header and a bare address', () => {
    expect(
      parseEmailContactsCsv('email,vardas\njonas@example.com,Jonas\n'),
    ).toEqual([{ email: 'jonas@example.com', full_name: 'Jonas' }])
    expect(parseEmailContactsCsv('ona@example.com')).toEqual([
      { email: 'ona@example.com', full_name: '' },
    ])
  })

  it('quotes exported names', () => {
    const csv = emailContactsToCsv([
      { email: 'jonas@example.com', full_name: 'Jonas, Petras', status: 'active' },
    ])
    expect(csv).toContain('"Jonas, Petras"')
    expect(parseEmailContactsCsv(csv)[0]?.full_name).toBe('Jonas, Petras')
  })
})
