export interface TelegramContactCsvRow {
  chat_id: string
  telegram_user_id: string
  username: string
  first_name: string
  last_name: string
}

const COLUMNS = [
  'chat_id',
  'telegram_user_id',
  'username',
  'first_name',
  'last_name',
] as const

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

export function parseTelegramContactsCsv(text: string): TelegramContactCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase())
  const hasHeader = header.includes('chat_id')
  const indexes = hasHeader
    ? Object.fromEntries(COLUMNS.map((column) => [column, header.indexOf(column)]))
    : { chat_id: 0, telegram_user_id: 1, username: 2, first_name: 3, last_name: 4 }

  return (hasHeader ? lines.slice(1) : lines).map((line) => {
    const cells = splitCsvLine(line)
    const value = (column: (typeof COLUMNS)[number]) => {
      const index = indexes[column]
      return index >= 0 ? (cells[index] ?? '').replace(/^@/, '') : ''
    }
    return {
      chat_id: value('chat_id'),
      telegram_user_id: value('telegram_user_id'),
      username: value('username'),
      first_name: value('first_name'),
      last_name: value('last_name'),
    }
  })
}

function csvCell(value: string | null) {
  const text = value ?? ''
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function telegramContactsToCsv(
  rows: Array<{
    chat_id: string
    telegram_user_id: string | null
    username: string | null
    first_name: string | null
    last_name: string | null
    language_code: string | null
    status: string
  }>,
) {
  const header = [
    ...COLUMNS,
    'language_code',
    'status',
  ]
  const body = rows.map((row) =>
    [
      row.chat_id,
      row.telegram_user_id,
      row.username,
      row.first_name,
      row.last_name,
      row.language_code,
      row.status,
    ]
      .map((value) => csvCell(value))
      .join(','),
  )
  return [header.join(','), ...body].join('\n')
}
