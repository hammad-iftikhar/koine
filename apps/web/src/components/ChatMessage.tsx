import { AlertTriangle } from 'lucide-react'
import { cn } from '../lib/cn'

export type ChatMessageProps = {
  author: string
  time: string
  body: string
  translated?: string
  own?: boolean
  translationFailed?: boolean
}

/**
 * A single chat message: the original text, plus its translation into the
 * reader's language when one exists — never hidden just because a
 * translation failed.
 *
 * `own` and `translationFailed` are never signalled by colour alone: an own
 * message also gets a mirrored bubble corner and sits right-aligned; a
 * failed translation also gets a warning icon and its own distinct copy,
 * so both states still read for someone who can't distinguish the colour.
 */
export function ChatMessage({
  author,
  time,
  body,
  translated,
  own = false,
  translationFailed = false,
}: ChatMessageProps) {
  return (
    <div
      data-testid="chat-message"
      data-own={String(own)}
      className={cn('flex flex-col gap-[3px]', own ? 'items-end' : 'items-start')}
    >
      <div className="flex items-baseline gap-2">
        <b className="text-[13px] font-semibold">{author}</b>
        <span className="tabular-nums text-[11.5px] text-fg-2">{time}</span>
      </div>
      <div
        data-testid="message-bubble"
        className={cn(
          'max-w-[85%] break-words rounded-[14px] border px-3 py-2 text-[13.5px]',
          own
            ? 'rounded-br-[4px] border-white/25 bg-blue text-ink'
            : 'rounded-bl-[4px] border-[var(--edge)] bg-[var(--pane)] text-fg-2',
        )}
      >
        <p className="m-0">{body}</p>
        {translated && (
          <p
            className={cn(
              'm-0 mt-1.5 border-l-2 pl-2',
              own ? 'border-ink/30 text-ink' : 'border-blue text-fg',
            )}
          >
            {translated}
          </p>
        )}
        {translationFailed && (
          <p
            className={cn(
              'm-0 mt-1.5 flex items-center gap-1 text-[12px]',
              own ? 'text-ink' : 'text-amber',
            )}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            Translation unavailable
          </p>
        )}
      </div>
    </div>
  )
}
