import { Link, useParams } from 'react-router'
import { currentLocale } from '@/i18n/localePath'
import { NotFoundPage } from '@/pages/NotFoundPage'
import {
  EVERGREEN_GUIDE,
  GUIDE_PUBLISHED,
  type GuideDiagram,
} from './evergreenGuide'
import { CompareFigure, FunnelFigure, ProcessFigure } from './GuideFigures'

const MORE: Record<string, { guides: string; home: string; pricing: string }> = {
  en: { guides: 'All guides', home: 'NewWebinars', pricing: 'Pricing' },
  lt: { guides: 'Visi gidai', home: 'NewWebinars', pricing: 'Kainos' },
  ru: { guides: 'Все гиды', home: 'NewWebinars', pricing: 'Тарифы' },
}

export function GuideArticlePage() {
  const { slug } = useParams()
  const locale = currentLocale()
  const article = EVERGREEN_GUIDE[locale]
  if (!slug || slug !== article.slug) return <NotFoundPage />
  const more = MORE[locale]
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-muted-foreground text-xs">{GUIDE_PUBLISHED}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">{article.title}</h1>
      <p className="text-muted-foreground mt-5 text-lg leading-8">{article.excerpt}</p>
      {article.sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-4 leading-7">
              {paragraph}
            </p>
          ))}
          {section.bullets ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 leading-7">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <Diagram name={section.diagram} visuals={article.visuals} />
        </section>
      ))}
      <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm">
        <Link to="/guides">{more.guides}</Link>
        <Link to="/">{more.home}</Link>
        <Link to="/pricing">{more.pricing}</Link>
      </nav>
    </article>
  )
}

function Diagram({
  name,
  visuals,
}: {
  name?: GuideDiagram
  visuals: (typeof EVERGREEN_GUIDE)['en']['visuals']
}) {
  if (name === 'process') return <ProcessFigure visuals={visuals} />
  if (name === 'compare') return <CompareFigure visuals={visuals} />
  if (name === 'funnel') return <FunnelFigure visuals={visuals} />
  return null
}
