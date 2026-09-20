import { Track } from 'livekit-client'
import { describe, expect, it, vi } from 'vitest'
import {
  type AudioSink,
  type SyncablePublication,
  syncAudio,
  wantedChannel,
} from '@/lib/translation-audio'

type FakePublication = SyncablePublication & { asked: boolean[] }

/**
 * A publication as the SDK hands one over: `isDesired` is `subscribed !==
 * false`, and `subscribed` is initialised from `autoSubscribe`, which
 * defaults to true. So a publication the client has never spoken to already
 * says it wants the track — that is the whole shape of the reconnect bug.
 */
function publication(trackName: string, over: Partial<SyncablePublication> = {}): FakePublication {
  const asked: boolean[] = []
  const pub: FakePublication = {
    kind: Track.Kind.Audio,
    trackName,
    trackSid: `sid:${trackName}`,
    isMuted: false,
    isDesired: true,
    track: {} as never,
    setSubscribed(on: boolean) {
      asked.push(on)
      pub.isDesired = on
    },
    asked,
    ...over,
  }
  return pub
}

function roomOf(...publications: SyncablePublication[]) {
  return {
    remoteParticipants: new Map([
      ['p1', { trackPublications: new Map(publications.map((p) => [p.trackSid, p])) }],
    ]),
  }
}

function spySink() {
  const sink: AudioSink = {
    renderFloor: vi.fn(),
    renderTranslation: vi.fn(),
    retain: vi.fn(),
    setDucked: vi.fn(),
  }
  return sink as { [K in keyof AudioSink]: ReturnType<typeof vi.fn> }
}

describe('wantedChannel', () => {
  it('names the one channel this listener is entitled to', () => {
    expect(wantedChannel('es')).toBe('tr:es')
  })

  it('wants no channel at all on the floor', () => {
    expect(wantedChannel('floor')).toBeNull()
  })
})

describe('syncAudio', () => {
  it('takes one channel and actively refuses every other language', () => {
    // Left to auto-subscribe, every listener pulls every language off the
    // SFU and the channel model's entire bandwidth saving is gone.
    const es = publication('tr:es')
    const ja = publication('tr:ja')
    const ur = publication('tr:ur')
    const sink = spySink()

    syncAudio(roomOf(es, ja, ur), wantedChannel('es'), sink)

    expect([es.isDesired, ja.isDesired, ur.isDesired]).toEqual([true, false, false])
    // Refusal is a call, not an omission.
    expect(ja.asked).toEqual([false])
    expect(ur.asked).toEqual([false])
    expect(sink.renderTranslation).toHaveBeenCalledTimes(1)
    expect(sink.setDucked).toHaveBeenCalledWith(true)
  })

  it('refuses a channel that appears later, rather than ignoring it', () => {
    const es = publication('tr:es')
    const sink = spySink()
    syncAudio(roomOf(es), wantedChannel('es'), sink)

    // A second listener joins wanting Japanese, so the agent opens tr:ja.
    const ja = publication('tr:ja')
    syncAudio(roomOf(es, ja), wantedChannel('es'), sink)

    expect(ja.asked).toEqual([false])
    expect(es.asked).toEqual([])
  })

  it('re-refuses every foreign channel after a reconnect rebuilds the publications', () => {
    // A reconnect destroys every remote participant and rebuilds it, so each
    // publication is a NEW object with `subscribed` reset to autoSubscribe —
    // true — while its sid stays the same. Anything that remembers "I already
    // unsubscribed sid X" matches, skips the re-refusal, and leaves the
    // client pulling every language for the rest of the call.
    const sink = spySink()
    const before = [publication('tr:es'), publication('tr:ja'), publication('tr:ur')]
    syncAudio(roomOf(...before), wantedChannel('es'), sink)
    expect(before.map((p) => p.isDesired)).toEqual([true, false, false])

    const after = [publication('tr:es'), publication('tr:ja'), publication('tr:ur')]
    expect(after.map((p) => p.trackSid)).toEqual(before.map((p) => p.trackSid))
    expect(after.map((p) => p.isDesired)).toEqual([true, true, true])

    syncAudio(roomOf(...after), wantedChannel('es'), sink)

    expect(after.map((p) => p.isDesired)).toEqual([true, false, false])
    expect(after[1]?.asked).toEqual([false])
    expect(after[2]?.asked).toEqual([false])
  })

  it('never offers a real microphone to the subscription decision', () => {
    // The floor can never be unsubscribed, whatever its desired state says.
    const mic = publication('microphone')
    const quiet = publication('microphone-2', { isDesired: false })
    const sink = spySink()

    syncAudio(roomOf(mic, quiet), wantedChannel('es'), sink)

    expect(mic.asked).toEqual([])
    expect(quiet.asked).toEqual([])
    expect(sink.renderFloor).toHaveBeenCalledTimes(2)
  })

  it('subscribes to nothing and ducks nothing for a listener on the floor', () => {
    const es = publication('tr:es')
    const mic = publication('microphone')
    const sink = spySink()

    syncAudio(roomOf(es, mic), wantedChannel('floor'), sink)

    expect(es.asked).toEqual([false])
    expect(sink.renderTranslation).not.toHaveBeenCalled()
    expect(sink.renderFloor).toHaveBeenCalledTimes(1)
    expect(sink.setDucked).toHaveBeenCalledWith(false)
  })

  it('brings the floor back to full gain when the agent dies and its track goes', () => {
    const sink = spySink()
    const es = publication('tr:es')
    syncAudio(roomOf(es, publication('microphone')), wantedChannel('es'), sink)
    expect(sink.setDucked).toHaveBeenLastCalledWith(true)

    // The worker is gone; only the people are left.
    syncAudio(roomOf(publication('microphone')), wantedChannel('es'), sink)

    expect(sink.setDucked).toHaveBeenLastCalledWith(false)
    expect(sink.retain).toHaveBeenLastCalledWith(new Set(['sid:microphone']))
  })

  it('does not duck under a channel that is subscribed but silent', () => {
    const sink = spySink()
    syncAudio(roomOf(publication('tr:es', { isMuted: true })), wantedChannel('es'), sink)

    expect(sink.renderTranslation).not.toHaveBeenCalled()
    expect(sink.setDucked).toHaveBeenCalledWith(false)
  })

  it('ignores video, so a camera is never mistaken for a channel', () => {
    const video = publication('tr:es', { kind: Track.Kind.Video })
    const sink = spySink()

    syncAudio(roomOf(video), wantedChannel('es'), sink)

    expect(video.asked).toEqual([])
    expect(sink.renderTranslation).not.toHaveBeenCalled()
  })
})
