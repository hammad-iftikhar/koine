import { ParticipantKind } from 'livekit-client'

/**
 * Everyone in the room who is a person.
 *
 * The translation worker joins as a *visible* participant, deliberately:
 * LiveKit will not let a hidden participant's tracks be subscribed to, so a
 * hidden agent would publish `tr:<lang>` into the void. It is infrastructure
 * rather than an attendee, so it belongs in no tile and no head count, and
 * every roster in the app derives from this one filter rather than each
 * consumer remembering to apply it.
 *
 * `kind` is set by the SDK from the server's own participant record, so
 * there is no identity-prefix convention here to get out of step with.
 */
export function withoutAgents<T extends { kind: ParticipantKind }>(participants: T[]): T[] {
  return participants.filter((p) => p.kind !== ParticipantKind.AGENT)
}
