import { describe, expect, it } from 'vitest'
import {
  EVERGREEN_GUIDE,
  GUIDE_INDEX,
  guidePathForLocale,
} from './evergreenGuide'
import { buildGuideSeoPages } from './guideSeo'

describe('evergreen guide', () => {
  it('keeps meta descriptions in the search snippet range', () => {
    for (const locale of ['en', 'lt', 'ru'] as const) {
      expect(GUIDE_INDEX[locale].description.length).toBeGreaterThanOrEqual(140)
      expect(GUIDE_INDEX[locale].description.length).toBeLessThanOrEqual(170)
      expect(EVERGREEN_GUIDE[locale].description.length).toBeGreaterThanOrEqual(140)
      expect(EVERGREEN_GUIDE[locale].description.length).toBeLessThanOrEqual(170)
      expect(EVERGREEN_GUIDE[locale].sections.filter((section) => section.heading)).not.toHaveLength(0)
    }
  })

  it('switches the article slug with the language', () => {
    expect(guidePathForLocale('/guides/evergreen-webinar', 'lt')).toBe(
      '/guides/kas-yra-evergreen-webinaras',
    )
    expect(guidePathForLocale('/guides/chto-takoe-evergreen-vebinar', 'en')).toBe(
      '/guides/evergreen-webinar',
    )
    expect(guidePathForLocale('/pricing', 'lt')).toBeNull()
  })

  it('publishes one h1 and language alternates for crawlers', () => {
    const pages = buildGuideSeoPages()
    const lithuanian = pages.find(
      (page) => page.locale === 'lt' && page.path.includes('kas-yra'),
    )
    expect(lithuanian?.noscript.match(/<h1>/g)).toHaveLength(1)
    expect(lithuanian?.hreflang.en).toBe(
      'https://newwebinars.com/guides/evergreen-webinar',
    )
    expect(lithuanian?.hreflang.ru).toContain('/ru/guides/chto-takoe-evergreen-vebinar')
    expect(pages).toHaveLength(6)
  })
})
