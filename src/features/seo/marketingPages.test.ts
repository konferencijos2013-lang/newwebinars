import { describe, expect, it } from 'vitest'
import { loadMarketingCopy } from './loadMarketingCopy'
import {
  buildMarketingPages,
  escapeHtml,
  isPrivatePath,
  llmsText,
  pageUrl,
  renderMarketingHtml,
  sitemapXml,
  type MarketingCopy,
} from './marketingPages'

const copy: MarketingCopy = {
  appName: 'NewWebinars',
  hero: {
    headline: 'A webinar that sells itself',
    subheadline: 'One recording runs on its own.',
  },
  features: {
    title: 'Features',
    subtitle: 'A sales room.',
    items: [{ title: 'Chat <script>', description: 'Messages appear.' }],
  },
  howItWorks: {
    title: 'How it works',
    steps: [{ title: 'Upload', description: 'Add the recording.' }],
  },
  cta: { title: 'Launch', subtitle: 'Start free.', button: 'Start' },
  pricing: {
    title: 'Pricing',
    subtitle: 'Start free.',
    plans: [{ name: 'Free', price: '€0/month' }],
  },
  partners: {
    title: 'Partners',
    subtitle: 'Earn commission.',
    commissionTitle: '30%',
    commissionDescription: 'For 12 months.',
  },
  privacy: {
    title: 'Privacy',
    intro: 'How data is used.',
    sections: [{ title: 'Data', description: 'We store an account.' }],
  },
  terms: {
    title: 'Terms',
    intro: 'Rules of use.',
    sections: [{ title: 'Account', description: 'You need an account.' }],
  },
  cookies: {
    title: 'Cookies',
    intro: 'Storage on this site.',
    sections: [{ title: 'Necessary', description: 'Session storage.' }],
  },
  login: { title: 'Welcome', subtitle: 'Sign in.' },
}

const shell = `<html lang="__SEO_LANG__"><title>__SEO_TITLE__</title><meta name="description" content="__SEO_DESCRIPTION__" /><link rel="canonical" href="__SEO_CANONICAL__" />__SEO_HREFLANG__<script type="application/ld+json">__SEO_JSONLD__</script><noscript>__SEO_NOSCRIPT__</noscript></html>`

describe('marketing pages', () => {
  it('builds absolute language urls', () => {
    expect(pageUrl('en', '/')).toBe('https://newwebinars.com/')
    expect(pageUrl('lt', '/pricing')).toBe('https://newwebinars.com/lt/pricing')
    expect(isPrivatePath('/lt/mail')).toBe(true)
    expect(isPrivatePath('/pricing')).toBe(false)
  })

  it('puts readable escaped text into the shell', () => {
    const home = buildMarketingPages({ en: copy, lt: copy, ru: copy }).find(
      (page) => page.locale === 'en' && page.path === '/',
    )
    expect(home).toBeDefined()
    const html = renderMarketingHtml(shell, home!)
    expect(html).toContain('A webinar that sells itself')
    expect(html).toContain('One recording runs on its own.')
    expect(html).toContain(escapeHtml('Chat <script>'))
    expect(html).not.toContain('<script>Messages')
    expect(html).toContain('https://newwebinars.com/lt')
    expect(html).toContain('SoftwareApplication')
  })

  it('lists every public language page once in the sitemap', () => {
    const pages = buildMarketingPages({ en: copy, lt: copy, ru: copy })
    const xml = sitemapXml(pages)
    expect(xml).toContain('https://newwebinars.com/ru/partners')
    expect(xml.match(/<loc>/g)).toHaveLength(18)
  })

  it('reads the published locale copy', () => {
    const copies = loadMarketingCopy()
    const home = buildMarketingPages(copies).find(
      (page) => page.locale === 'lt' && page.path === '/',
    )
    expect(home?.title).toContain('Vebinaras, kuris pats parduoda')
    expect(home?.noscript).toContain('Paysera')
    expect(llmsText(copies.en)).toContain('mail@newwebinars.com')
  })

  it('describes the product for AI crawlers without invented results', () => {
    const text = llmsText(copy)
    expect(text).toContain('does not include customer revenue totals')
    expect(text).toContain('€0/month')
    expect(text).toContain('https://newwebinars.com/lt')
  })
})
