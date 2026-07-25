import { useCallback, useEffect, useRef } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Eraser,
} from 'lucide-react'
import { cn } from '@/shared/utils/cn'

type Command = { command: string; value?: string }

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      // Prevent the editor from losing focus/selection before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 items-center justify-center rounded transition-colors',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  multiline = true,
  className,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastValue = useRef(value)

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value
      lastValue.current = value
    }
  }, [value])

  const emitChange = useCallback(() => {
    if (!ref.current) return
    const html = ref.current.innerHTML
    lastValue.current = html
    onChange(html)
  }, [onChange])

  const runCommand = useCallback(
    ({ command, value: commandValue }: Command) => {
      ref.current?.focus()
      document.execCommand(command, false, commandValue)
      emitChange()
    },
    [emitChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    emitChange()
  }

  const handleLink = () => {
    const url = window.prompt('Nuoroda (URL):', 'https://')
    if (!url) return
    runCommand({ command: 'createLink', value: url })
  }

  return (
    <div
      className={cn(
        'border-border focus-within:ring-primary/40 overflow-hidden rounded-md border focus-within:ring-2',
        className,
      )}
    >
      <div className="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1">
        <ToolbarButton
          title="Paryškinta"
          onClick={() => runCommand({ command: 'bold' })}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Kursyvas"
          onClick={() => runCommand({ command: 'italic' })}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Pabraukta"
          onClick={() => runCommand({ command: 'underline' })}
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <div className="bg-border mx-1 h-5 w-px" />
        <ToolbarButton
          title="Lygiuoti kairėje"
          onClick={() => runCommand({ command: 'justifyLeft' })}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lygiuoti centre"
          onClick={() => runCommand({ command: 'justifyCenter' })}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Lygiuoti dešinėje"
          onClick={() => runCommand({ command: 'justifyRight' })}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        {multiline && (
          <>
            <div className="bg-border mx-1 h-5 w-px" />
            <ToolbarButton
              title="Sąrašas su ženkleliais"
              onClick={() => runCommand({ command: 'insertUnorderedList' })}
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Numeruotas sąrašas"
              onClick={() => runCommand({ command: 'insertOrderedList' })}
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
          </>
        )}
        <div className="bg-border mx-1 h-5 w-px" />
        <ToolbarButton title="Nuoroda" onClick={handleLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Išvalyti formatavimą"
          onClick={() => runCommand({ command: 'removeFormat' })}
        >
          <Eraser className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className={cn(
          'text-foreground bg-background empty:before:text-muted-foreground min-h-[2.5rem] px-3 py-2 text-sm outline-none empty:before:content-[attr(data-placeholder)]',
          multiline && 'min-h-[7rem]',
        )}
      />
    </div>
  )
}
