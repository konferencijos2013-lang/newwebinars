import { Link } from 'react-router'
import { currentLocale } from '@/i18n/localePath'
import { EVERGREEN_GUIDE, GUIDE_INDEX, GUIDE_PUBLISHED } from './evergreenGuide'

export function GuidesPage() {
  const locale = currentLocale()
  const index = GUIDE_INDEX[locale]
  const article = EVERGREEN_GUIDE[locale]
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-bold tracking-[-0.04em]">{index.title}</h1>
      <p className="text-muted-foreground mt-4 text-lg leading-8">{index.intro}</p>
      <article className="mt-10 border-t pt-8">
        <p className="text-muted-foreground text-xs">{GUIDE_PUBLISHED}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">
          <Link to={`/guides/${article.slug}`}>{article.title}</Link>
        </h2>
        <p className="text-muted-foreground mt-3 leading-7">{article.excerpt}</p>
      </article>
    </section>
  )
}
