import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { BlockRenderer } from './BlockRenderer'
import { formatOfferPrice, normalizeOfferTiers } from './offerTiers'
import { safePublicUrl } from './safePublicUrl'
import type { FunnelBlock } from '@/shared/database.types'

describe('safePublicUrl', () => {
  it('allows secure external and site-relative URLs', () => {
    expect(safePublicUrl('https://example.com/offer')).toBe(
      'https://example.com/offer',
    )
    expect(safePublicUrl('/pricing')).toBe('/pricing')
  })

  it('rejects executable, protocol-relative, and malformed URLs', () => {
    expect(safePublicUrl('javascript:alert(1)')).toBe('#')
    expect(safePublicUrl('data:text/html,test')).toBe('#')
    expect(safePublicUrl('//evil.example/path')).toBe('#')
    expect(safePublicUrl('not a URL')).toBe('#')
  })

  it('supports an empty fallback for image sources', () => {
    expect(safePublicUrl('javascript:alert(1)', '')).toBe('')
    expect(safePublicUrl(undefined, '')).toBe('')
  })
})

describe('offer tiers', () => {
  it('normalizes one featured tier even with inconsistent stored data', () => {
    const tiers = normalizeOfferTiers({
      tiers: [
        { name: 'Basic', price: '49', featured: true },
        { name: 'Standard', price: '99', featured: true },
        { name: 'Pro', price: '249' },
      ],
    })
    expect(tiers).toHaveLength(3)
    expect(tiers.map((tier) => tier.featured)).toEqual([true, false, false])
  })

  it('keeps a billing period beside the price', () => {
    const tiers = normalizeOfferTiers({
      tiers: [{ name: 'Standard', price: '49', period: '/mėn.' }],
    })
    expect(tiers[0]?.period).toBe('/mėn.')
  })

  it('formats numeric prices and preserves descriptive prices', () => {
    expect(formatOfferPrice('49', 'EUR')).toMatch(/49/)
    expect(formatOfferPrice('€19/mėn.', 'EUR')).toBe('€19/mėn.')
  })
})

describe('host photo upload', () => {
  it('opens a file picker when the empty host photo is clicked', async () => {
    const instance = i18n.createInstance()
    await instance.use(initReactI18next).init({
      lng: 'lt',
      resources: {
        lt: {
          funnels: {
            heroPhotoChoose: 'Pasirinkti nuotrauką',
            heroPhotoPlaceholder: 'Įkelkite vedėjo nuotrauką',
            imageUploading: 'Įkeliama…',
          },
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const clicks: HTMLElement[] = []
    const originalClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function click() {
      clicks.push(this)
    }
    const block: FunnelBlock = {
      id: 'hero',
      page_id: 'page',
      block_type: 'webinar_hero',
      sort_order: 0,
      content: {
        showImage: true,
        imageUrl: '',
        title: 'Gyva sesija',
        eyebrow: 'Nemokamas',
        subtitle: 'Planas',
        badge: 'Nemokamai',
        showCountdown: false,
        buttonText: 'Registruotis',
      },
      settings: {},
      created_at: '',
      updated_at: '',
    }
    try {
      await act(async () => {
        root.render(
          createElement(
            I18nextProvider,
            { i18n: instance },
            createElement(BlockRenderer, {
              block,
              isPreview: true,
              onReplaceImage: async () => undefined,
            }),
          ),
        )
      })
      const picker = container.querySelector('[role="button"]')
      expect(picker?.textContent).toContain('Pasirinkti nuotrauką')
      await act(async () => {
        picker?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(
        clicks.some((element) => element instanceof HTMLInputElement),
      ).toBe(true)
    } finally {
      HTMLInputElement.prototype.click = originalClick
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
