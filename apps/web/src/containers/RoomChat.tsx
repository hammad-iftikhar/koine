import { type ChatMessageDTO, FLOOR, MessagesResponse } from '@koine/shared'
import { useRoomContext } from '@livekit/components-react'
import { type RemoteParticipant, RoomEvent } from 'livekit-client'
import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatPanel } from '@/components/ChatPanel'
import { apiFetch } from '@/lib/api'
import { decodeChatMessage } from '@/lib/chat-messages'

const CHAT_TOPIC = 'chat'

function historyPath(code: string, hearLang: string) {
  // Never request translation into the floor — FLOOR means "original audio",
  // not a language to translate into, and an empty `hear` value would reach
  // the translator as a real target language.
  return hearLang === FLOOR
    ? `/api/meetings/${code}/messages`
    : `/api/meetings/${code}/messages?hear=${encodeURIComponent(hearLang)}`
}

// The POST response always carries `translations: {}` (the server never
// translates on write), so a message delivered live is indistinguishable
// from one whose translation genuinely failed until we check the room's
// listening language against it.
function needsTranslation(message: ChatMessageDTO, hearLang: string) {
  return hearLang !== FLOOR && message.lang !== hearLang && !message.translations[hearLang]
}

// Merge by id rather than replace: the data channel is lower-latency than
// any history GET, so a message that already arrived live (or one the user
// just sent) must not be wiped out by a snapshot taken before it existed.
function mergeMessagesById(prev: ChatMessageDTO[], incoming: ChatMessageDTO[]): ChatMessageDTO[] {
  const byId = new Map(prev.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function RoomChat({
  code,
  participantId,
  hearLang,
  onClose,
}: {
  code: string
  participantId: string
  hearLang: string
  onClose: () => void
}) {
  const room = useRoomContext()
  const [messages, setMessages] = useState<ChatMessageDTO[]>([])
  const [failedSend, setFailedSend] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Coalesces re-fetches triggered by `needsTranslation`: several messages
  // arriving in the same burst must produce at most one fetch in flight and
  // at most one more queued behind it, never one fetch per message.
  const fetching = useRef(false)
  const queued = useRef(false)

  const refetchHistory = useCallback(async () => {
    if (fetching.current) {
      queued.current = true
      return
    }
    fetching.current = true
    try {
      const raw = await apiFetch(historyPath(code, hearLang))
      const parsed = MessagesResponse.safeParse(raw)
      if (parsed.success) {
        setMessages((prev) => mergeMessagesById(prev, parsed.data.messages))
      }
    } catch {
      // Best effort — the live copy (translated or not) stays on screen.
    } finally {
      fetching.current = false
      if (queued.current) {
        queued.current = false
        void refetchHistory()
      }
    }
  }, [code, hearLang])

  // History first: a late joiner must see what was said before they arrived.
  // Merged by id, not replaced: the data channel is lower-latency than this
  // GET, so a message that arrives (or one the user sends) before it
  // resolves must survive the snapshot landing after it.
  useEffect(() => {
    let active = true
    apiFetch(historyPath(code, hearLang))
      .then((raw) => {
        const parsed = MessagesResponse.safeParse(raw)
        if (active && parsed.success) {
          setMessages((prev) => mergeMessagesById(prev, parsed.data.messages))
        }
      })
      .catch(() => {
        // History unavailable is not fatal — live messages still arrive.
      })
    return () => {
      active = false
    }
  }, [code, hearLang])

  // Live delivery over the room connection. No second realtime system.
  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _k?: unknown,
      topic?: string,
    ) => {
      if (topic !== CHAT_TOPIC) return
      // The whole accept/refuse decision, sender included, lives in
      // `decodeChatMessage` — the same trust boundary `decodeCaption`
      // enforces for captions: every joiner's token carries
      // `canPublishData`, so a well-formed packet proves nothing about who
      // sent it on its own.
      const incoming = decodeChatMessage(payload, participant)
      if (!incoming) return
      // The payload's `author` is not trusted either: decodeChatMessage
      // only proved the sender IS this participantId, not that the name
      // they typed for themselves is real. Render the roster's name for
      // them instead, the way LiveCaptions derives the speaker's name.
      const author =
        room.getParticipantByIdentity?.(incoming.participantId)?.name ?? incoming.author
      const message = author === incoming.author ? incoming : { ...incoming, author }
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      // A live message never carries a translation for us yet. Re-fetch
      // history once it lands so it becomes translated instead of staying
      // marked "Translation unavailable" forever.
      if (needsTranslation(message, hearLang)) void refetchHistory()
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, hearLang, refetchHistory])

  async function send(body: string) {
    try {
      const { message } = await apiFetch<{ message: ChatMessageDTO }>(
        `/api/meetings/${code}/messages`,
        { method: 'POST', body: JSON.stringify({ participantId, body }) },
      )
      setFailedSend((prev) => (prev === body ? null : prev))
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      if (needsTranslation(message, hearLang)) void refetchHistory()
      try {
        await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
          reliable: true,
          topic: CHAT_TOPIC,
        })
      } catch {
        // Stored and shown locally already; a live-broadcast hiccup alone
        // does not need its own retry.
      }
    } catch {
      // The store failed outright — nothing was persisted or broadcast, and
      // ChatPanel has already cleared the draft. Keep the text so the user
      // can retry rather than silently losing what they typed.
      setFailedSend(body)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <ChatPanel
          onClose={onClose}
          onSend={send}
          messages={messages.map((m) => ({
            id: m.id,
            author: m.participantId === participantId ? 'You' : m.author,
            time: new Date(m.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            body: m.body,
            translated:
              hearLang === FLOOR || m.lang === hearLang ? undefined : m.translations[hearLang],
            translationFailed: needsTranslation(m, hearLang),
            own: m.participantId === participantId,
          }))}
        />
      </div>

      {failedSend && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[14px] border border-[var(--edge)] bg-[var(--well)] px-3 py-2 text-[12.5px] text-fg-2"
        >
          <AlertTriangle size={14} className="shrink-0 text-amber" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Message not sent: "{failedSend}"</span>
          <button
            type="button"
            disabled={retrying}
            onClick={() => {
              // Without this guard a double-click posts the same text
              // twice: `send` clears `failedSend` only after the request
              // resolves, so a second click before that happens fires a
              // second, identical POST.
              if (retrying) return
              setRetrying(true)
              void send(failedSend).finally(() => setRetrying(false))
            }}
            className="shrink-0 rounded-full border border-[var(--edge)] px-2.5 py-1 text-[12px] font-medium text-blue transition-colors hover:bg-blue/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-60"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
