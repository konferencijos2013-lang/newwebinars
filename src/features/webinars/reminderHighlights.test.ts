import { describe, expect, it } from 'vitest'
import { formatHighlights } from './reminderHighlights'

describe('formatHighlights', () => {
  it('stays empty when the description is too thin', () => {
    expect(formatHighlights('Trumpas aprašymas.', 'lt')).toBe('')
  })

  it('uses real sentences from the description and invents nothing else', () => {
    const text = formatHighlights(
      'Pamatysite, kur dingsta pirmi klientai. Sužinosite, kurią žinutę siųsti kitą rytą. Trečias sakinys lieka sąraše, nes jis dar telpa. Ketvirtas sakinys jau nebetilps į laišką.',
      'lt',
    )
    expect(text).toContain('• Pamatysite, kur dingsta pirmi klientai.')
    expect(text).toContain('• Sužinosite, kurią žinutę siųsti kitą rytą.')
    expect(text).not.toContain('Ketvirtas sakinys')
    expect(text.startsWith('Kas lieka po vebinaro:')).toBe(true)
  })
})