import { describe, expect, it } from 'vitest'
import {
  FUNNEL_TEMPLATE_LANGUAGES,
  FUNNEL_TEMPLATES,
  getFunnelTemplates,
  localizeFunnelTemplate,
  normalizeFunnelTemplateLanguage,
} from './templates'

describe('funnel templates', () => {
  it('provides localized templates for every editable step', () => {
    expect(FUNNEL_TEMPLATES).toHaveLength(16)
    expect(getFunnelTemplates('registration')).toHaveLength(6)
    expect(getFunnelTemplates('waiting_room')).toHaveLength(4)
    expect(getFunnelTemplates('offer')).toHaveLength(6)

    for (const template of FUNNEL_TEMPLATES) {
      for (const language of FUNNEL_TEMPLATE_LANGUAGES) {
        expect(template.name[language]).toBeTruthy()
        expect(template.description[language]).toBeTruthy()
        expect(template.blocks[language].length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps a functional system block in every waiting-room template', () => {
    for (const template of getFunnelTemplates('waiting_room')) {
      for (const language of FUNNEL_TEMPLATE_LANGUAGES) {
        expect(
          template.blocks[language].filter(
            (block) => block.block_type === 'waiting_room_system',
          ),
        ).toHaveLength(1)
      }
    }
  })

  it('uses distinct offer compositions', () => {
    const blockTypes = getFunnelTemplates('offer').map((template) =>
      template.blocks.en.map((block) => block.block_type),
    )
    expect(blockTypes).toEqual([
      ['hero', 'text', 'offer', 'faq'],
      ['hero', 'video', 'offer', 'faq'],
      ['hero', 'image', 'offer', 'faq'],
      ['hero', 'offer', 'faq'],
      ['hero', 'benefits', 'offer', 'faq'],
      ['hero', 'countdown', 'offer', 'faq'],
    ])
  })

  it('reserves a host photo on portrait registration templates', () => {
    const photoTemplates = getFunnelTemplates('registration').filter(
      (template) =>
        template.blocks.en.some(
          (block) =>
            block.block_type === 'webinar_hero' &&
            block.content.showImage === true,
        ),
    )
    expect(photoTemplates.map((template) => template.id)).toEqual([
      'registration-portrait',
      'registration-invite',
    ])
    for (const template of photoTemplates) {
      for (const language of FUNNEL_TEMPLATE_LANGUAGES) {
        const hero = template.blocks[language].find(
          (block) => block.block_type === 'webinar_hero',
        )
        expect(hero?.content.imageUrl).toBe('')
        expect(hero?.content.imageAlt).toBeTruthy()
        expect(['stacked', 'split']).toContain(hero?.content.imageLayout)
      }
    }
  })

  it('provides exactly three normalized tiers and one featured tier', () => {
    for (const template of getFunnelTemplates('offer')) {
      for (const language of FUNNEL_TEMPLATE_LANGUAGES) {
        const offer = template.blocks[language].find(
          (block) => block.block_type === 'offer',
        )
        const tiers = offer?.content.tiers
        expect(offer?.content.mode).toBe('tiers')
        expect(Array.isArray(tiers)).toBe(true)
        expect(tiers).toHaveLength(3)
        expect(
          (tiers as Array<{ featured?: boolean }>).filter(
            (tier) => tier.featured,
          ),
        ).toHaveLength(1)
        expect(
          (tiers as Array<{ id?: string }>).map((tier) => tier.id),
        ).toEqual(['basic', 'standard', 'pro'])
      }
    }
  })

  it('localizes using LT/RU and falls back to English', () => {
    const template = FUNNEL_TEMPLATES[0]
    expect(normalizeFunnelTemplateLanguage('lt-LT')).toBe('lt')
    expect(normalizeFunnelTemplateLanguage('ru')).toBe('ru')
    expect(normalizeFunnelTemplateLanguage('de-DE')).toBe('en')
    expect(localizeFunnelTemplate(template, 'lt').name).toBe(template.name.lt)
  })
})
