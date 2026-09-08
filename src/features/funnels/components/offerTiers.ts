export type OfferTier = {
  name: unknown
  description: unknown
  price: unknown
  currency: unknown
  oldPrice: unknown
  features: unknown
  badge: unknown
  featured: boolean
  buttonText: unknown
  buttonUrl: unknown
}

export function formatOfferPrice(value: unknown, currency: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const amount = Number(raw.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(amount)) return raw
  const currencyCode = String(currency || 'EUR')
    .trim()
    .toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${new Intl.NumberFormat().format(amount)} ${currencyCode}`.trim()
  }
}

export function normalizeOfferTiers(
  content: Record<string, unknown>,
): OfferTier[] {
  if (!Array.isArray(content.tiers)) return []
  const source = content.tiers.filter((tier): tier is Record<string, unknown> =>
    Boolean(tier && typeof tier === 'object'),
  )
  if (!source.length) return []
  const requestedFeatured = source.findIndex((tier) => tier.featured === true)
  const featuredIndex =
    requestedFeatured >= 0 ? requestedFeatured : Math.min(1, source.length - 1)
  return source.map((tier, index) => ({
    name: tier.name,
    description: tier.description,
    price: tier.price,
    currency: tier.currency,
    oldPrice: tier.oldPrice,
    features: tier.features,
    badge: tier.badge,
    featured: index === featuredIndex,
    buttonText: tier.buttonText,
    buttonUrl: tier.buttonUrl,
  }))
}
