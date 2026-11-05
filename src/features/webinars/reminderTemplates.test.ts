import { describe, expect, it } from 'vitest'
import { standardReminders, translatedStandardReminder } from './reminderTemplates'

describe('translatedStandardReminder', () => {
  it('rewrites an untouched Lithuanian reminder into Russian', () => {
    expect(
      translatedStandardReminder('ru', {
        timing: 'before_start',
        minutes_before: 60,
        audience: 'all',
        channel: 'email',
        subject: 'Po valandos: {{webinar_title}}',
        body: 'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po valandos.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
      }),
    ).toMatchObject({
      subject: 'Через час: {{webinar_title}}',
    })
  })

  it('puts the registration confirmation first', () => {
    const first = standardReminders('lt')[0]
    expect(first.timing).toBe('on_registration')
    expect(first.subject).toContain('Užsiregistravote')
  })

  it('leaves a hand-edited reminder unchanged', () => {
    expect(
      translatedStandardReminder('en', {
        timing: 'before_start',
        minutes_before: 60,
        audience: 'all',
        channel: 'email',
        subject: 'Mano tema',
        body: 'Mano tekstas',
      }),
    ).toBeNull()
  })
})
