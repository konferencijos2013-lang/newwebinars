import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEO_LOCALES, type MarketingCopy, type SeoLocale } from './marketingPages.ts'

type LandingFile = {
  hero: MarketingCopy['hero']
  features: MarketingCopy['features']
  howItWorks: MarketingCopy['howItWorks']
  cta: MarketingCopy['cta']
  pricing: {
    title: string
    subtitle: string
    free: { name: string; price: string }
    start: { name: string; monthPrice: string }
    grow: { name: string; monthPrice: string }
    scale: { name: string; monthPrice: string }
  }
  partners: MarketingCopy['partners']
}

type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

type LegalFile = {
  privacy: { title: string; intro: string; sections: LegalSection[] }
  terms: { title: string; intro: string; sections: LegalSection[] }
}

type CommonFile = {
  appName: string
  cookiePolicy: {
    title: string
    intro: string
    sections: Record<string, { title: string; description: string }>
  }
}

type AuthFile = { loginTitle: string; loginSubtitle: string }

function readJson<T>(locale: SeoLocale, name: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public/locales', locale, `${name}.json`), 'utf8'),
  ) as T
}

function sections(items: LegalSection[]): MarketingCopy['privacy']['sections'] {
  return items.map((section) => ({
    title: section.title,
    description: [...(section.paragraphs ?? []), ...(section.bullets ?? [])].join(' '),
  }))
}

export function loadMarketingCopy(): Record<SeoLocale, MarketingCopy> {
  const copies = {} as Record<SeoLocale, MarketingCopy>
  for (const locale of SEO_LOCALES) {
    const landing = readJson<LandingFile>(locale, 'landing')
    const legal = readJson<LegalFile>(locale, 'legal')
    const common = readJson<CommonFile>(locale, 'common')
    const auth = readJson<AuthFile>(locale, 'auth')
    copies[locale] = {
      appName: common.appName,
      hero: landing.hero,
      features: landing.features,
      howItWorks: landing.howItWorks,
      cta: landing.cta,
      pricing: {
        title: landing.pricing.title,
        subtitle: landing.pricing.subtitle,
        plans: [
          { name: landing.pricing.free.name, price: landing.pricing.free.price },
          {
            name: landing.pricing.start.name,
            price: landing.pricing.start.monthPrice,
          },
          {
            name: landing.pricing.grow.name,
            price: landing.pricing.grow.monthPrice,
          },
          {
            name: landing.pricing.scale.name,
            price: landing.pricing.scale.monthPrice,
          },
        ],
      },
      partners: landing.partners,
      privacy: {
        title: legal.privacy.title,
        intro: legal.privacy.intro,
        sections: sections(legal.privacy.sections),
      },
      terms: {
        title: legal.terms.title,
        intro: legal.terms.intro,
        sections: sections(legal.terms.sections),
      },
      cookies: {
        title: common.cookiePolicy.title,
        intro: common.cookiePolicy.intro,
        sections: Object.values(common.cookiePolicy.sections).map((section) => ({
          title: section.title,
          description: section.description,
        })),
      },
      login: { title: auth.loginTitle, subtitle: auth.loginSubtitle },
    }
  }
  return copies
}
