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

export function pageContentSettings(
  value: BackgroundSettings | null | undefined,
) {
  const width = Number(value?.content_width)
  return {
    content_width: Number.isFinite(width)
      ? Math.max(600, Math.min(800, width))
      : 800,
    content_panel_enabled: value?.content_panel_enabled === true,
    content_background_color:
      typeof value?.content_background_color === 'string'
        ? value.content_background_color
        : '#ffffff',
    content_border_enabled: value?.content_border_enabled === true,
    content_border_color:
      typeof value?.content_border_color === 'string'
        ? value.content_border_color
        : '#e5e7eb',
    content_border_width: Math.max(
      1,
      Math.min(4, Number(value?.content_border_width) || 1),
    ),
    content_border_radius: Math.max(
      0,
      Math.min(40, Number(value?.content_border_radius) || 16),
    ),
    content_shadow: ['none', 'small', 'medium', 'large'].includes(
      String(value?.content_shadow),
    )
      ? String(value?.content_shadow)
      : 'none',
  }
}

export function pageContentStyle(
  value: BackgroundSettings | null | undefined,
): CSSProperties {
  const settings = pageContentSettings(value)
  const shadows: Record<string, string | undefined> = {
    none: undefined,
    small: '0 4px 12px rgba(15, 23, 42, 0.08)',
    medium: '0 12px 30px rgba(15, 23, 42, 0.14)',
    large: '0 24px 60px rgba(15, 23, 42, 0.2)',
  }
  return {
    width: '100%',
    maxWidth: `${settings.content_width}px`,
    backgroundColor: settings.content_panel_enabled
      ? String(settings.content_background_color)
      : undefined,
    borderStyle: settings.content_border_enabled ? 'solid' : undefined,
    borderColor: settings.content_border_enabled
      ? String(settings.content_border_color)
      : undefined,
    borderWidth: settings.content_border_enabled
      ? `${settings.content_border_width}px`
      : undefined,
    borderRadius:
      settings.content_panel_enabled ||
      settings.content_border_enabled ||
      settings.content_shadow !== 'none'
        ? `${settings.content_border_radius}px`
        : undefined,
    boxShadow: shadows[settings.content_shadow],
  }
}
