import { FLOOR } from '@koine/shared'
import { useRoomContext } from '@livekit/components-react'
import { type RemoteTrack, type RemoteTrackPublication, RoomEvent, Track } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { createDucker } from '../lib/ducking'

/**
 * The agent publishes one audio track per target language, named
 * `tr:<lang>` — see the worker's `tracks.ts`. Everything else is the floor.
 */
const TRANSLATION_PREFIX = 'tr:'

/** Room events that can change which channel exists or whether it is live. */
const RESYNC_ON = [
  RoomEvent.Connected,
  RoomEvent.Reconnected,
  RoomEvent.Disconnected,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
] as const

/**
 * All of this room's audio: the floor, ducked, and at most one translation
 * channel over the top of it.
 *
 * This is the only thing in the app that plays remote audio, and it must stay
 * that way. Each track is rendered exactly once — the floor through the Web
 * Audio graph (its `<audio>` element deliberately silenced, which is what
 * livekit-client itself does when a track is routed through an AudioContext),
 * the translated voice through its `<audio>` element alone, never entering
 * the graph. Adding a `<RoomAudioRenderer />` alongside this would make the
 * listener hear everything twice.
 */
export function TranslationAudio({ hearLang }: { hearLang: string }) {
  const room = useRoomContext()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // One context per page, created here and closed on unmount. Browsers
    // start it suspended until the page has been interacted with, so it is
    // resumed on the first gesture rather than assumed to be running.
    const context = new AudioContext()
    const ducker = createDucker(context)

    /** Subscriptions we have already asked the server for, by track sid. */
    const asked = new Map<string, boolean>()
    /** Elements we own, by track sid, so unmount detaches exactly ours. */
    const playing = new Map<string, { element: HTMLMediaElement; track: RemoteTrack }>()

    // `floor` means the listener wants the original untranslated: no channel
    // to subscribe to, and nothing to duck under.
    const wanted = hearLang === FLOOR ? null : `${TRANSLATION_PREFIX}${hearLang}`

    function ask(publication: RemoteTrackPublication, on: boolean) {
      if (asked.get(publication.trackSid) === on) return
      asked.set(publication.trackSid, on)
      publication.setSubscribed(on)
    }

    function play(sid: string, track: RemoteTrack, silent: boolean): HTMLMediaElement {
      const existing = playing.get(sid)
      if (existing) return existing.element
      const element = track.attach()
      element.muted = silent
      element.volume = silent ? 0 : 1
      host?.appendChild(element)
      playing.set(sid, { element, track })
      return element
    }

    function stop(sid: string) {
      const held = playing.get(sid)
      if (!held) return
      playing.delete(sid)
      held.track.detach(held.element)
      held.element.remove()
    }

    function sync() {
      const live = new Set<string>()
      let translationPlaying = false

      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.kind !== Track.Kind.Audio) continue

          if (publication.trackName.startsWith(TRANSLATION_PREFIX)) {
            // Exactly one channel, and every other language refused out loud.
            // Left to auto-subscribe, twenty-five listeners would each pull
            // every language off the SFU and the channel model's entire
            // bandwidth saving would be gone — self-hosted, that egress is
            // ours to pay for, so the refusal is explicit rather than
            // implied by not asking.
            const mine = publication.trackName === wanted
            ask(publication, mine)
            if (!mine) continue

            const track = publication.track
            if (!track || publication.isMuted) continue
            live.add(publication.trackSid)
            play(publication.trackSid, track, false)
            translationPlaying = true
            continue
          }

          // The floor. Always subscribed, always audible, only ever turned
          // down — people read tone and turn-taking off the original even
          // when they cannot parse the words.
          const track = publication.track
          if (!track) continue
          live.add(publication.trackSid)
          if (!playing.has(publication.trackSid)) {
            const element = play(publication.trackSid, track, true)
            // The element is silent; this is what actually renders it. A
            // muted element is still required: it is what keeps the WebRTC
            // stream flowing into Web Audio in Chromium.
            const stream = element.srcObject
            if (stream instanceof MediaStream) ducker.attachFloor(stream)
          }
        }
      }

      for (const sid of [...playing.keys()]) if (!live.has(sid)) stop(sid)

      // Recomputed from scratch on every event, so the floor comes back to
      // full gain by the same path whether the translation simply stopped or
      // the agent died and took its track with it.
      ducker.setDucked(translationPlaying)
    }

    // Autoplay: both halves can be blocked independently, so both are
    // unblocked on any gesture. Cheap enough to leave attached for the whole
    // call, which is what makes a later block (a new tab, a device change)
    // recoverable rather than permanent.
    const unblock = () => {
      if (context.state !== 'running') void context.resume().catch(() => undefined)
      if (!room.canPlaybackAudio) void room.startAudio().catch(() => undefined)
    }
    unblock()
    document.addEventListener('pointerdown', unblock)
    document.addEventListener('keydown', unblock)

    for (const event of RESYNC_ON) room.on(event, sync)
    sync()

    return () => {
      document.removeEventListener('pointerdown', unblock)
      document.removeEventListener('keydown', unblock)
      for (const event of RESYNC_ON) room.off(event, sync)
      for (const sid of [...playing.keys()]) stop(sid)
      void context.close().catch(() => undefined)
    }
  }, [room, hearLang])

  return <div ref={hostRef} style={{ display: 'none' }} />
}
