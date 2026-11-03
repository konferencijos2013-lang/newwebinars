import { describe, expect, it } from 'vitest'
import { localeFromPath, localizedPath } from './localePath'

describe('locale paths', () => {
  it('treats the bare site as English', () => {
    expect(localeFromPath('/')).toEqual({
      locale: 'en',
      basename: '/',
      pathname: '/',
    })
    expect(localeFromPath('/pricing')).toMatchObject({ locale: 'en', pathname: '/pricing' })
  })

  it('reads lt and ru from the first segment', () => {
    expect(localeFromPath('/lt')).toEqual({
      locale: 'lt',
      basename: '/lt',
      pathname: '/',
    })
    expect(localeFromPath('/ru/webinars/new')).toEqual({
      locale: 'ru',
      basename: '/ru',
      pathname: '/webinars/new',
    })
  })

  it('builds a shareable path for each language', () => {
    expect(localizedPath('/pricing', 'en')).toBe('/pricing')
    expect(localizedPath('/pricing', 'lt')).toBe('/lt/pricing')
    expect(localizedPath('/', 'ru')).toBe('/ru')
    expect(localizedPath('/lt/login?returnTo=%2Fdashboard', 'en')).toBe(
      '/login?returnTo=%2Fdashboard',
    )
  })
})
