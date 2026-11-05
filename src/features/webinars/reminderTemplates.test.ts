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
        subject: 'Liko valanda. „{{webinar_title}}“ prasidės su jumis arba be jūsų',
        body: 'Sveiki, {{name}},\n\npo valandos pirma mintis nuskambės vieną kartą. Vėliau ją tenka dėlioti iš to, ką kiti jau suprato.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}',
      }),
    ).toMatchObject({
      subject: 'Остался час. «{{webinar_title}}» начнётся с вами или без вас',
    })
  })

  it('puts the registration confirmation first', () => {
    const first = standardReminders('lt')[0]
    expect(first.timing).toBe('on_registration')
    expect(first.subject).toContain('pavadinimas')
    expect(first.body).toContain('{{highlights}}')
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
