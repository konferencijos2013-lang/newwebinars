import { cn } from '@/shared/utils/cn'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'border-border bg-background text-foreground flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm shadow-sm',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
