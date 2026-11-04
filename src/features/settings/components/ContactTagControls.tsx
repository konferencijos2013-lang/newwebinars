import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type {
  ContactTag,
  TagCondition,
  TagMatch,
} from '@/features/settings/api/contactTags'

function setCondition(
  conditions: TagCondition[],
  tagId: string,
  present: boolean,
) {
  const current = conditions.find((item) => item.tagId === tagId)
  if (current?.present === present) {
    return conditions.filter((item) => item.tagId !== tagId)
  }
  return [
    ...conditions.filter((item) => item.tagId !== tagId),
    { tagId, present },
  ]
}

export function ContactTagFilters({
  tags,
  conditions,
  match,
  disabled,
  onChange,
  onCreate,
  onDelete,
}: {
  tags: ContactTag[]
  conditions: TagCondition[]
  match: TagMatch
  disabled: boolean
  onChange: (conditions: TagCondition[], match: TagMatch) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (tag: ContactTag) => Promise<void>
}) {
  const { t } = useTranslation('common')
  const matchName = useId()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onCreate(trimmed)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {tags.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t('tags.match')}</p>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={matchName}
                checked={match === 'all'}
                disabled={disabled}
                onChange={() => onChange(conditions, 'all')}
              />
              {t('tags.matchAll')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={matchName}
                checked={match === 'any'}
                disabled={disabled}
                onChange={() => onChange(conditions, 'any')}
              />
              {t('tags.matchAny')}
            </label>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{t('tags.matchHint')}</p>
        </div>
      )}
      <div>
        <p className="text-sm font-medium">{t('tags.has')}</p>
        <p className="text-muted-foreground text-xs">{t('tags.hasHint')}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <span className="text-muted-foreground text-xs">{t('tags.none')}</span>
          ) : (
            tags.map((tag) => {
              const selected = conditions.some(
                (item) => item.tagId === tag.id && item.present,
              )
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={disabled}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border'
                  }`}
                  onClick={() =>
                    onChange(setCondition(conditions, tag.id, true), match)
                  }
                >
                  {tag.name}
                </button>
              )
            })
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">{t('tags.lacks')}</p>
        <p className="text-muted-foreground text-xs">{t('tags.lacksHint')}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag) => {
            const selected = conditions.some(
              (item) => item.tagId === tag.id && !item.present,
            )
            return (
              <button
                key={tag.id}
                type="button"
                disabled={disabled}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  selected
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-border'
                }`}
                onClick={() =>
                  onChange(setCondition(conditions, tag.id, false), match)
                }
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <Input
          value={name}
          maxLength={40}
          disabled={disabled || busy}
          placeholder={t('tags.placeholder')}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={disabled || busy || !name.trim()}>
          {t('tags.create')}
        </Button>
      </form>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="text-muted-foreground text-xs underline"
              disabled={disabled}
              onClick={() => {
                if (window.confirm(t('tags.deleteConfirm', { name: tag.name })))
                  void onDelete(tag)
              }}
            >
              {t('tags.remove', { name: tag.name })}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ContactTagPicker({
  tags,
  tagIds,
  disabled,
  onToggle,
}: {
  tags: ContactTag[]
  tagIds: string[]
  disabled: boolean
  onToggle: (tagId: string, assigned: boolean) => void
}) {
  const { t } = useTranslation('common')
  const assigned = tags.filter((tag) => tagIds.includes(tag.id))
  const available = tags.filter((tag) => !tagIds.includes(tag.id))
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {assigned.map((tag) => (
        <button
          key={tag.id}
          type="button"
          disabled={disabled}
          className="bg-muted rounded-full px-2 py-0.5 text-xs"
          onClick={() => onToggle(tag.id, false)}
        >
          {tag.name} ×
        </button>
      ))}
      {available.length > 0 && (
        <select
          className="border-border bg-background h-7 rounded-md border px-1 text-xs"
          disabled={disabled}
          value=""
          aria-label={t('tags.add')}
          onChange={(event) => {
            if (event.target.value) onToggle(event.target.value, true)
          }}
        >
          <option value="">{t('tags.add')}</option>
          {available.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
