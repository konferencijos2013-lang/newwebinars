import { describe, expect, it } from 'vitest'
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
