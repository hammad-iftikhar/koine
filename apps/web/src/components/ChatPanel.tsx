import { Send, X } from 'lucide-react'
import { useState } from 'react'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

export type ChatPanelProps = {
  messages: (ChatMessageProps & { id: string })[]
  onSend: (body: string) => void
  onClose: () => void
}

/**
 * The room's chat surface. It is a normal flex child — never
 * `position: fixed/absolute` — so plan 07's room layout can place it beside
 * the video grid and let flexbox shrink the grid rather than overlay it.
 *
 * Purely presentational: plan 07's `RoomChat` container feeds `messages`
 * from a data channel plus REST history and wires up `onSend`/`onClose`.
 */
export function ChatPanel({ messages, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState('')

  function submit() {
    const body = draft.trim()
    if (!body) return
    onSend(body)
    setDraft('')
  }

  return (
    <aside
      aria-label="Chat"
      className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-[18px]"
    >
      <header className="flex items-center gap-2.5 border-b border-[var(--edge)] px-4 py-3.5">
        <h3 className="m-0 flex-1 text-[15px] font-semibold tracking-[-0.02em]">
          In-call messages
        </h3>
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-fg-2 transition-colors hover:bg-[var(--pane-2)] hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
        <p className="m-0 rounded-[12px] bg-[var(--well)] px-3 py-2.5 text-[12px] text-fg-2">
          Messages are visible to everyone in the call and translated to each person's language.
        </p>
        <div role="log" aria-live="polite" aria-label="Messages" className="flex flex-col gap-3.5">
          {messages.map(({ id, ...msg }) => (
            <ChatMessage key={id} {...msg} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--edge)] p-3">
        <input
          aria-label="Send a message"
          placeholder="Send a message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          className="min-w-0 flex-1 rounded-full border border-[var(--edge)] bg-[var(--well)] px-[15px] py-2.5 text-[14px] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        />
        <button
          type="button"
          aria-label="Send"
          onClick={submit}
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-blue transition-colors hover:bg-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <Send size={19} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
