import { describe, expect, it } from 'vitest'
import { formatOfferPrice, normalizeOfferTiers } from './offerTiers'
import { safePublicUrl } from './safePublicUrl'

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
