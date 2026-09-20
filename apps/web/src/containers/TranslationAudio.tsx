import { useRoomContext } from '@livekit/components-react'
import { type RemoteTrack, RoomEvent } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { createDucker } from '../lib/ducking'
import { type AudioSink, syncAudio, wantedChannel } from '../lib/translation-audio'

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
 *
 * The policy this runs on lives in `lib/translation-audio.ts`, where it can
 * be tested against a plain-object room. What is left here is the part that
 * genuinely needs a browser: elements, and an AudioContext's lifecycle.
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

    /** Elements we own, by track sid, so unmount detaches exactly ours. */
    const playing = new Map<string, { element: HTMLMediaElement; track: RemoteTrack }>()

    const render = (sid: string, track: RemoteTrack, silent: boolean): HTMLMediaElement | null => {
      const existing = playing.get(sid)
      if (existing) return null
      const element = track.attach()
      element.muted = silent
      element.volume = silent ? 0 : 1
      host.appendChild(element)
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

    const sink: AudioSink = {
      renderFloor(sid, track) {
        const element = render(sid, track, true)
        if (!element) return
        // The element is silent; this is what actually renders it. A muted
        // element is still required: it is what keeps the WebRTC stream
        // flowing into Web Audio in Chromium.
        const stream = element.srcObject
        if (stream instanceof MediaStream) ducker.attachFloor(stream)
      },
      renderTranslation(sid, track) {
        render(sid, track, false)
      },
      retain(live) {
        for (const sid of [...playing.keys()]) if (!live.has(sid)) stop(sid)
      },
      setDucked: ducker.setDucked,
    }

    const wanted = wantedChannel(hearLang)
    const sync = () => syncAudio(room, wanted, sink)

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
