import { FLOOR } from '@koine/shared'
import { type RemoteTrack, Track } from 'livekit-client'

/**
 * The agent publishes one audio track per target language, named
 * `tr:<lang>` — see the worker's `tracks.ts`. Everything else is the floor.
 */
export const TRANSLATION_PREFIX = 'tr:'

/**
 * The one channel this listener is entitled to, or `null` for the floor —
 * `floor` means the original untranslated, so there is nothing to subscribe
 * to and nothing to duck under.
 */
export function wantedChannel(hearLang: string): string | null {
  return hearLang === FLOOR ? null : `${TRANSLATION_PREFIX}${hearLang}`
}

/** Just enough of `RemoteTrackPublication` for {@link syncAudio}. */
export type SyncablePublication = {
  kind: Track.Kind
  trackName: string
  trackSid: string
  isMuted: boolean
  /** The client's own subscription intent, which survives nothing. See below. */
  isDesired: boolean
  track?: RemoteTrack
  setSubscribed(subscribed: boolean): void
}

/** Just enough of `Room` for {@link syncAudio}. */
export type SyncableRoom = {
  remoteParticipants: Map<string, { trackPublications: Map<string, SyncablePublication> }>
}

/**
 * Where the decisions land. Every method is idempotent, so {@link syncAudio}
 * can re-run on any room event without the sink needing to know it did.
 */
export type AudioSink = {
  /** Renders the original, silently — the ducker's graph is what is heard. */
  renderFloor(sid: string, track: RemoteTrack): void
  /** Renders the translated voice, which never enters the graph. */
  renderTranslation(sid: string, track: RemoteTrack): void
  /** Stops rendering everything whose sid is not in `live`. */
  retain(live: Set<string>): void
  /** Turns the floor down under the translated voice, and back up after it. */
  setDucked(on: boolean): void
}

/**
 * One pass over the room: who is subscribed, what is rendered, and whether
 * the floor is ducked.
 *
 * Extracted from the component so it can be driven by a plain-object room —
 * it is the whole of the subscription policy, and the policy is where the
 * money is. Everything is recomputed from the room's current state rather
 * than accumulated, which is what makes it safe to re-run on every event and
 * what brings the floor back to full gain by the same path whether the
 * translation merely stopped or the agent died and took its track with it.
 */
export function syncAudio(room: SyncableRoom, wanted: string | null, sink: AudioSink): void {
  const live = new Set<string>()
  let translationPlaying = false

  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.kind !== Track.Kind.Audio) continue

      // The floor: a real person's microphone. It never reaches the
      // subscription decision below, so it can never be unsubscribed.
      if (!publication.trackName.startsWith(TRANSLATION_PREFIX)) {
        const track = publication.track
        if (!track) continue
        live.add(publication.trackSid)
        sink.renderFloor(publication.trackSid, track)
        continue
      }

      // Exactly one channel, and every other language refused out loud.
      // Left to auto-subscribe, twenty-five listeners would each pull every
      // language off the SFU and the channel model's entire bandwidth saving
      // would be gone — self-hosted, that egress is ours to pay for.
      //
      // Memoised against the SDK's own `isDesired` (`subscribed !== false`)
      // and never against a map of our own keyed by sid. A reconnect
      // destroys and rebuilds every publication with `subscribed` reset to
      // `autoSubscribe`, which is `true` by default, while the sid stays the
      // same — so a local memo would match, skip the re-refusal, and leave
      // the client pulling every language for the rest of the call.
      const mine = publication.trackName === wanted
      if (publication.isDesired !== mine) publication.setSubscribed(mine)
      if (!mine) continue

      const track = publication.track
      if (!track || publication.isMuted) continue
      live.add(publication.trackSid)
      sink.renderTranslation(publication.trackSid, track)
      translationPlaying = true
    }
  }

  sink.retain(live)
  sink.setDucked(translationPlaying)
}
