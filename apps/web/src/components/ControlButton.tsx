import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type ControlButtonProps = {
  label: string
  icon: ReactNode
  state?: 'default' | 'active' | 'danger'
  wide?: boolean
  onClick?: () => void
}

export function ControlButton({
  label,
  icon,
  state = 'default',
  wide = false,
  onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-state={state}
      onClick={onClick}
      className={cn(
        'grid h-[46px] place-items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
        wide ? 'w-auto gap-2 px-[22px]' : 'w-[46px]',
        state === 'default' && 'border-[var(--edge)] bg-[var(--pane-2)] text-fg hover:bg-white/20',
        state === 'active' && 'border-white/25 bg-blue text-white',
        state === 'danger' && 'border-white/25 bg-red text-white',
      )}
    >
      {icon}
    </button>
  )
}
