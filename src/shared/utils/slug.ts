export function slugify(value: string) {
  const ascii = value
    .trim()
    .toLocaleLowerCase('lt-LT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return ascii || 'webinar'
}
