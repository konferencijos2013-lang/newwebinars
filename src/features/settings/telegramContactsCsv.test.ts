import { describe, expect, it } from 'vitest'
import {
  parseTelegramContactsCsv,
  telegramContactsToCsv,
} from './telegramContactsCsv'

describe('telegram contact csv', () => {
  it('reads a header and a bare chat id list', () => {
    expect(
      parseTelegramContactsCsv(
        'chat_id,username,first_name\n123,@Vardenis,Jonas\n',
      ),
    ).toEqual([
      {
        chat_id: '123',
        telegram_user_id: '',
        username: 'Vardenis',
        first_name: 'Jonas',
        last_name: '',
      },
    ])
    expect(parseTelegramContactsCsv('456')).toEqual([
      {
        chat_id: '456',
        telegram_user_id: '',
        username: '',
        first_name: '',
        last_name: '',
      },
    ])
  })

  it('quotes exported names', () => {
    const csv = telegramContactsToCsv([
      {
        chat_id: '1',
        telegram_user_id: null,
        username: null,
        first_name: 'Jonas, Petras',
        last_name: null,
        language_code: 'lt',
        status: 'active',
      },
    ])
    expect(csv).toContain('"Jonas, Petras"')
    expect(parseTelegramContactsCsv(csv)[0]?.first_name).toBe('Jonas, Petras')
  })
})
