import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { ContactTag } from '@/features/settings/api/contactTags'

function toggle(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

export function ContactTagFilters({
  tags,
  includeIds,
  excludeIds,
  disabled,
  onChange,
  onCreate,
  onDelete,
}: {
  tags: ContactTag[]
  includeIds: string[]
  excludeIds: string[]
  disabled: boolean
  onChange: (includeIds: string[], excludeIds: string[]) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (tag: ContactTag) => Promise<void>
}) {
  const { t } = useTranslation('common')
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
      <div>
        <p className="text-sm font-medium">{t('tags.has')}</p>
        <p className="text-muted-foreground text-xs">{t('tags.hasHint')}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <span className="text-muted-foreground text-xs">{t('tags.none')}</span>
          ) : (
            tags.map((tag) => {
              const selected = includeIds.includes(tag.id)
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
                    onChange(
                      toggle(includeIds, tag.id),
                      excludeIds.filter((id) => id !== tag.id),
                    )
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
            const selected = excludeIds.includes(tag.id)
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
                  onChange(
                    includeIds.filter((id) => id !== tag.id),
                    toggle(excludeIds, tag.id),
                  )
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
