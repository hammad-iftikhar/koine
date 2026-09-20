import { ChatMessageDTO } from '@koine/shared'

/** Just enough of `RemoteParticipant` to say who sent a data packet. */
export type ChatSender = { identity: string }

/**
 * The one chat packet worth accepting, or `undefined`.
 *
 * Same trust decision `decodeCaption` makes for captions, applied to chat:
 * every joiner's token carries `canPublishData`, so a well-formed
 * `ChatMessageDTO` on the wire proves nothing about who sent it. Without
 * this check any participant could publish a packet carrying someone else's
 * `participantId` and have it render on every screen attributed to that
 * person for the rest of the call.
 *
 * The join route mints the LiveKit identity as the participant id (see
 * `apps/api/src/routes/meetings.ts`), so the check is exact rather than
 * heuristic: a packet is accepted only when the identity LiveKit attaches to
 * the data event matches the `participantId` inside the payload itself. A
 * packet with no sender (server-originated) is refused for the same reason
 * `decodeCaption` refuses one.
 *
 * `safeParse` alone is not enough here either — `JSON.parse` throws on bytes
 * that are not JSON at all, and this runs inside LiveKit's own event
 * emitter, so a throw here would take the room's chat listener with it.
 *
 * This does not vouch for the payload's `author`: a sender's own identity
 * matching its own `participantId` says nothing about what name it put in
 * the packet. Callers must derive the displayed name from the room roster
 * (`room.getParticipantByIdentity`), the way `LiveCaptions` derives the
 * speaker's name, rather than trusting `author` off the wire.
 */
export function decodeChatMessage(
  payload: Uint8Array,
  sender?: ChatSender,
): ChatMessageDTO | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload))
  } catch {
    return undefined
  }

  const result = ChatMessageDTO.safeParse(parsed)
  if (!result.success) return undefined
  if (sender?.identity !== result.data.participantId) return undefined

  return result.data
}
