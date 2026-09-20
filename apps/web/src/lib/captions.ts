import { CaptionSegment } from '@koine/shared'
import { ParticipantKind } from 'livekit-client'

/** Just enough of `RemoteParticipant` to say who sent a data packet. */
export type CaptionSender = { kind: ParticipantKind }

/**
 * The one caption packet worth rendering, or `null`.
 *
 * Two independent refusals, and the first is the one that matters.
 *
 * **Who sent it.** Every joiner's token carries `canPublishData`, so a
 * well-formed `CaptionSegment` on the wire proves nothing about who wrote it:
 * without this check any participant with the meeting code could broadcast a
 * segment carrying somebody else's `speakerIdentity` and have it render on
 * every screen under that person's display name. The product's premise is
 * that a translation you cannot audit is a translation you cannot trust, so a
 * caption that can be forged is worse than no caption. Only the worker
 * transcribes, and the worker is the only agent in the room — the same
 * `ParticipantKind.AGENT` discriminator the roster filter uses, set by the
 * SDK from the server's own participant record rather than from anything the
 * sender controls. A packet with no sender (server-originated) is refused for
 * the same reason.
 *
 * **What it says.** Untrusted input off the wire, so a malformed packet must
 * not blank the captions or crash the room — and `safeParse` alone is not
 * enough, because `JSON.parse` throws on bytes that are not JSON at all and
 * this runs inside LiveKit's own event emitter. Anything that is not a
 * `CaptionSegment` (a chat packet, a truncated frame) is dropped, leaving the
 * last good caption on screen.
 *
 * Extracted from the component the way `syncAudio` was: this is the whole of
 * the trust decision, and a trust decision belongs somewhere it can be tested
 * without a DOM.
 */
export function decodeCaption(payload: Uint8Array, sender?: CaptionSender): CaptionSegment | null {
  if (sender?.kind !== ParticipantKind.AGENT) return null

  try {
    const parsed = CaptionSegment.safeParse(JSON.parse(new TextDecoder().decode(payload)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
