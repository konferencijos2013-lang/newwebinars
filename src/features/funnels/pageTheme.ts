import type { CSSProperties } from 'react'

export type BackgroundSettings = Record<string, unknown>

export function backgroundStyle(
  settings: BackgroundSettings | null | undefined,
): CSSProperties {
  const theme = settings ?? {}
  const type = theme.background_type
  const color =
    typeof theme.background_color === 'string' ? theme.background_color : ''

  if (type === 'gradient') {
    const from =
      typeof theme.gradient_from === 'string' ? theme.gradient_from : '#ffffff'
    const to =
      typeof theme.gradient_to === 'string' ? theme.gradient_to : '#f3f4f6'
    const direction =
      typeof theme.gradient_direction === 'string'
        ? theme.gradient_direction
        : '135deg'
    return { backgroundImage: `linear-gradient(${direction}, ${from}, ${to})` }
  }

  if (
    type === 'image' &&
    typeof theme.background_image === 'string' &&
    theme.background_image
  ) {
    const overlay =
      Math.max(0, Math.min(100, Number(theme.background_overlay) || 0)) / 100
    const imageUrl = theme.background_image.replaceAll('"', '\\"')
    return {
      backgroundColor: color || undefined,
      backgroundImage: `linear-gradient(rgba(0, 0, 0, ${overlay}), rgba(0, 0, 0, ${overlay})), url("${imageUrl}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
    }
  }

  return color ? { backgroundColor: color } : {}
}

export function backgroundSettings(
  value: BackgroundSettings | null | undefined,
) {
  return {
    background_type: value?.background_type ?? 'none',
    background_color: value?.background_color ?? '#ffffff',
    gradient_from: value?.gradient_from ?? '#4f46e5',
    gradient_to: value?.gradient_to ?? '#a855f7',
    gradient_direction: value?.gradient_direction ?? '135deg',
    background_image: value?.background_image ?? '',
    background_overlay: value?.background_overlay ?? 0,
  }
}
