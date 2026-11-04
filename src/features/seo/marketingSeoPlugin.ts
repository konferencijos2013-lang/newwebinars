import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
import { loadMarketingCopy } from './loadMarketingCopy.ts'
import {
  buildMarketingPages,
  llmsText,
  outputHtmlPath,
  renderMarketingHtml,
  robotsTxt,
  sitemapXml,
} from './marketingPages.ts'

export function marketingSeoPlugin(): Plugin {
  return {
    name: 'marketing-seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.server) return html
        const home = buildMarketingPages(loadMarketingCopy()).find(
          (page) => page.locale === 'en' && page.path === '/',
        )
        return home ? renderMarketingHtml(html, home) : html
      },
    },
    closeBundle() {
      const shellPath = join(process.cwd(), 'dist/index.html')
      const shell = readFileSync(shellPath, 'utf8')
      if (!shell.includes('__SEO_TITLE__')) return
      const copies = loadMarketingCopy()
      const pages = buildMarketingPages(copies)
      for (const page of pages) {
        const file = join(process.cwd(), 'dist', outputHtmlPath(page.locale, page.path))
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, renderMarketingHtml(shell, page))
      }
      const dist = join(process.cwd(), 'dist')
      writeFileSync(join(dist, 'sitemap.xml'), sitemapXml(pages))
      writeFileSync(join(dist, 'llms.txt'), llmsText(copies.en))
      writeFileSync(join(dist, 'robots.txt'), robotsTxt())
    },
  }
}
