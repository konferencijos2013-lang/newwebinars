import { useTranslation } from 'react-i18next'
import { FileText, ShieldCheck } from 'lucide-react'

type LegalDocument = 'privacy' | 'terms'

type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const { t } = useTranslation('legal')
  const sections = t(`${document}.sections`, {
    returnObjects: true,
  }) as LegalSection[]
  const Icon = document === 'privacy' ? ShieldCheck : FileText

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
          <Icon className="h-3.5 w-3.5" /> {t('shared.eyebrow')}
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          {t(`${document}.title`)}
        </h1>
        <p className="text-muted-foreground mt-5 text-lg leading-8">
          {t(`${document}.intro`)}
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          {t('shared.lastUpdated')}
        </p>

        <div className="mt-10 space-y-5">
          {sections.map((section) => (
            <article
              key={section.title}
              className="bg-card rounded-2xl border p-6 shadow-sm sm:p-7"
            >
              <h2 className="text-lg font-bold">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p
                  className="text-muted-foreground mt-3 leading-7 whitespace-pre-line"
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="text-muted-foreground mt-3 space-y-2 pl-5 leading-7">
                  {section.bullets.map((bullet) => (
                    <li className="list-disc pl-1" key={bullet}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
