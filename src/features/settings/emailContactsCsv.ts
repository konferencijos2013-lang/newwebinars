export interface EmailContactCsvRow {
  email: string
  full_name: string
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') quoted = false
      else current += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

export function parseEmailContactsCsv(text: string): EmailContactCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase())
  const hasHeader = header.includes('email')
  const emailIndex = hasHeader ? header.indexOf('email') : 0
  const nameIndex = hasHeader
    ? header.findIndex((cell) =>
        ['full_name', 'name', 'vardas'].includes(cell),
      )
    : 1
  return (hasHeader ? lines.slice(1) : lines).map((line) => {
    const cells = splitCsvLine(line)
    return {
      email: (cells[emailIndex] ?? '').trim(),
      full_name: nameIndex >= 0 ? (cells[nameIndex] ?? '').trim() : '',
    }
  })
}

function csvCell(value: string | null) {
  const text = value ?? ''
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function emailContactsToCsv(
  rows: Array<{ email: string; full_name: string | null; status: string }>,
) {
  const body = rows.map((row) =>
    [row.email, row.full_name, row.status].map((value) => csvCell(value)).join(','),
  )
  return ['email,full_name,status', ...body].join('\n')
}
