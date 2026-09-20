import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ControlButtonProps = {
  label: string
  icon: ReactNode
  state?: 'default' | 'active' | 'danger'
  wide?: boolean
  disabled?: boolean
  onClick?: () => void
}

export function ControlButton({
  label,
  icon,
  state = 'default',
  wide = false,
  disabled = false,
  onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-state={state}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-[46px] place-items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
        wide ? 'w-auto gap-2 px-[22px]' : 'w-[46px]',
        // Unavailable, not merely dimmed: the button is also `disabled`, so the
        // reason reaches assistive tech through the label, not through opacity.
        disabled && 'cursor-not-allowed opacity-40',
        state === 'default' && 'border-[var(--edge)] bg-[var(--pane-2)] text-fg hover:bg-white/20',
        // text-white on bg-blue is 3.65:1 — below AA for text, but this button
        // is icon-only (`icon` is the sole content), and 3.65:1 clears WCAG's
        // 3:1 non-text threshold. Safe only as long as this stays icon-only;
        // if it ever gains a visible text label, switch to text-ink instead.
        state === 'active' && 'border-white/25 bg-blue text-white',
        state === 'danger' && 'border-white/25 bg-red text-white',
      )}
    >
      {icon}
    </button>
  )
}
