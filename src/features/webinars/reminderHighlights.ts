export type HighlightLanguage = 'lt' | 'en' | 'ru'

const LABELS: Record<HighlightLanguage, string> = {
  lt: 'Kas lieka po vebinaro:',
  en: 'What stays with you:',
  ru: 'Что останется с вами:',
}

function pieces(description: string) {
  const lines = description
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
  const source = lines.length >= 2 ? lines : description.split(/(?<=[.!?])\s+/)
  const seen = new Set<string>()
  const points: string[] = []
  for (const item of source) {
    const text = item.replace(/\s+/g, ' ').trim()
    const key = text.toLocaleLowerCase()
    if (text.length < 24 || text.length > 180 || seen.has(key)) continue
    seen.add(key)
    points.push(text)
    if (points.length === 3) break
  }
  return points
}

export function formatHighlights(
  description: string | null | undefined,
  language?: HighlightLanguage | null,
) {
  const points = pieces(description ?? '')
  if (points.length < 2) return ''
  const label = LABELS[language === 'en' || language === 'ru' ? language : 'lt']
  return `${label}\n${points.map((point) => `• ${point}`).join('\n')}\n\n`
}
