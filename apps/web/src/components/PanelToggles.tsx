import { Globe, Info, MessageSquare, Users } from 'lucide-react'
import { cn } from '@/lib/cn'

export type PanelName = 'details' | 'people' | 'chat' | 'languages'

export type PanelTogglesProps = {
  active: PanelName | null
  participantCount: number
  onOpen: (panel: PanelName) => void
}

const PANELS: { name: PanelName; label: string; icon: typeof Info }[] = [
  { name: 'details', label: 'Meeting details', icon: Info },
  { name: 'people', label: 'People', icon: Users },
  { name: 'chat', label: 'Chat', icon: MessageSquare },
  { name: 'languages', label: 'Languages', icon: Globe },
]

export function PanelToggles({ active, participantCount, onOpen }: PanelTogglesProps) {
  return (
    <div className="glass flex items-center justify-end gap-1 rounded-full p-1.5">
      {PANELS.map(({ name, label, icon: Icon }) => (
        <button
          key={name}
          type="button"
          aria-label={label}
          aria-pressed={active === name}
          onClick={() => onOpen(name)}
          className={cn(
            'relative grid h-[42px] w-[42px] place-items-center rounded-full text-fg-2 transition-colors hover:bg-[var(--pane-2)] hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
            active === name && 'bg-[var(--pane-2)] text-blue',
          )}
        >
          <Icon size={19} aria-hidden="true" />
          {name === 'people' && (
            <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-blue px-[3px] text-[10px] text-ink">
              {participantCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
