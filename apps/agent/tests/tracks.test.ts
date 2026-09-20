import { initializeLogger } from '@livekit/agents'
import type { AudioFrame } from '@livekit/rtc-node'
import { expect, it, vi } from 'vitest'
import { type Channel, channelFrom, createTrackPublisher, TTS_SAMPLE_RATE } from '@/tracks'

// `AudioByteStream` reaches for the framework logger the moment it is
// constructed, and in the worker it is `cli.runApp` that puts one there.
// Silent, so the framing under test does not narrate itself.
initializeLogger({ pretty: false, level: 'silent' })

/** `n` seconds of the format the TTS endpoint returns: 24 kHz mono 16-bit. */
function seconds(n: number): Buffer {
  return Buffer.alloc(TTS_SAMPLE_RATE * 2 * n)
}

/** Short enough that a handful of them stays well under the backlog ceiling. */
const BLIP = seconds(0.1)

/** Lets a test run every pending microtask, whatever the promise chain depth. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

type FakeChannel = Channel & {
  frames: AudioFrame[]
  closes: number
  /** Blocks every later capture until {@link FakeChannel.release}. */
  hold(): void
  release(): void
}

function fakeChannel(): FakeChannel {
  let gate: Promise<void> | undefined
  let open: (() => void) | undefined

  const channel: FakeChannel = {
    frames: [],
    closes: 0,
    queuedDuration: 0,
    hold() {
      gate = new Promise<void>((resolve) => {
        open = resolve
      })
    },
    release() {
      open?.()
      gate = undefined
      open = undefined
    },
    async captureFrame(frame: AudioFrame) {
      channel.frames.push(frame)
      if (gate) await gate
    },
    async close() {
      channel.closes += 1
    },
  }
  return channel
}

function publisherWith(open?: (lang: string) => Promise<Channel>) {
  const opened: FakeChannel[] = []
  const calls: string[] = []
  const openChannel = async (lang: string) => {
    calls.push(lang)
    if (open) return open(lang)
    const channel = fakeChannel()
    opened.push(channel)
    return channel
  }
  return { tracks: createTrackPublisher(openChannel), opened, calls }
}

it('opens one channel per language and reuses it across segments', async () => {
  const { tracks, calls, opened } = publisherWith()

  await tracks.publish(BLIP, 'en')
  await tracks.publish(BLIP, 'en')
  await tracks.publish(BLIP, 'es')

  // Two tracks named tr:en would be two half-conversations.
  expect(calls).toEqual(['en', 'es'])
  expect(opened).toHaveLength(2)
  expect(opened[0]?.frames.length).toBeGreaterThan(0)
  expect(opened[1]?.frames.length).toBeGreaterThan(0)
})

it('serialises a language rather than interleaving two utterances', async () => {
  const channel = fakeChannel()
  const { tracks } = publisherWith(async () => channel)

  // Hold the first capture open. Any frame the second segment manages to push
  // while it is held lands in the middle of the first one.
  channel.hold()
  const first = tracks.publish(BLIP, 'en')
  await settle()
  expect(channel.frames).toHaveLength(1)

  const second = tracks.publish(BLIP, 'en')
  await settle()
  expect(channel.frames).toHaveLength(1)

  channel.release()
  await Promise.all([first, second])
  expect(channel.frames.length).toBeGreaterThan(1)
})

it('evicts a failed open so the next segment retries', async () => {
  let attempt = 0
  const good = fakeChannel()
  const { tracks, calls } = publisherWith(async () => {
    attempt += 1
    if (attempt === 1) throw new Error('publish refused')
    return good
  })

  await expect(tracks.publish(BLIP, 'en')).rejects.toThrow('publish refused')
  // Without eviction every later segment re-awaits the same cached rejection
  // and the language stays silent for the rest of the meeting.
  await tracks.publish(BLIP, 'en')

  expect(calls).toEqual(['en', 'en'])
  expect(good.frames.length).toBeGreaterThan(0)
})

it('closes every channel it opened', async () => {
  const { tracks, opened } = publisherWith()

  await tracks.publish(BLIP, 'en')
  await tracks.publish(BLIP, 'es')
  await tracks.close()

  expect(opened.map((c) => c.closes)).toEqual([1, 1])
})

it('does not republish after close, even for synthesis already in flight', async () => {
  const { tracks, calls, opened } = publisherWith()

  await tracks.publish(BLIP, 'en')
  await tracks.close()

  // Segment A passed the spend check before segment B tripped the ceiling;
  // this is A coming back. A second tr:en here is a second track the client
  // matches by name and renders alongside the first.
  await tracks.publish(BLIP, 'en')

  expect(calls).toEqual(['en'])
  expect(opened).toHaveLength(1)
  expect(opened[0]?.closes).toBe(1)
})

it('takes down a channel whose publish landed after close', async () => {
  const late = fakeChannel()
  let finish: (() => void) | undefined
  const { tracks } = publisherWith(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return late
  })

  const inFlight = tracks.publish(BLIP, 'en')
  await settle()

  const closing = tracks.close()
  finish?.()
  await closing
  await inFlight.catch(() => {})
  await settle()

  // Closed once: not left published for the rest of the meeting, and not
  // closed twice by both the teardown and its own late arrival.
  expect(late.closes).toBe(1)
})

it('drops a segment when the language is already past the latency ceiling', async () => {
  const solo = fakeChannel()
  await createTrackPublisher(async () => solo).publish(seconds(2), 'en')
  const perSegment = solo.frames.length

  const channel = fakeChannel()
  const { tracks } = publisherWith(async () => channel)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  // Hold the chain so the backlog is real rather than instantly drained.
  channel.hold()
  const first = tracks.publish(seconds(2), 'en')
  await settle()
  // Accepted: nothing is waiting behind the one playing yet.
  const second = tracks.publish(seconds(2), 'en')
  // Refused: two seconds already waiting is past the 2.5 s hard ceiling, so
  // the listener would hear this long after the moment it belonged to.
  const third = tracks.publish(seconds(2), 'en')
  await third

  expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping tr:en'))

  channel.release()
  await Promise.all([first, second])
  await settle()
  expect(channel.frames).toHaveLength(perSegment * 2)
  warn.mockRestore()
})

it('plays again once the backlog has drained', async () => {
  const channel = fakeChannel()
  const { tracks } = publisherWith(async () => channel)

  // Dropping is only correct because the chain recovers: a long segment that
  // has finished leaves nothing waiting, so the next one is heard.
  await tracks.publish(seconds(2), 'en')
  const afterFirst = channel.frames.length
  await tracks.publish(seconds(2), 'en')

  expect(channel.frames).toHaveLength(afterFirst * 2)
})

it('unpublishes the track before releasing its source', async () => {
  const order: string[] = []
  const local = {
    unpublishTrack: vi.fn(async (_sid: string, _stopOnUnpublish?: boolean) => {
      order.push('unpublish')
    }),
  }
  const source = {
    queuedDuration: 0,
    captureFrame: vi.fn(async () => {}),
    close: vi.fn(async () => {
      order.push('source')
    }),
  }

  await channelFrom(local, { sid: 'TR_abc' }, source).close()

  // Closing the source alone disposes an FFI handle and nothing else: the
  // track stays published, subscribed and unmuted, no event reaches the
  // client, and the floor stays ducked under a channel that will never speak
  // again. `true` is `stopOnUnpublish` — end the track, do not keep it alive
  // for a republish that never comes.
  expect(local.unpublishTrack).toHaveBeenCalledWith('TR_abc', true)
  expect(order).toEqual(['unpublish', 'source'])
})

it('still releases the source when the publication was never acknowledged', async () => {
  const local = { unpublishTrack: vi.fn(async (_sid: string, _stop?: boolean) => {}) }
  const source = {
    queuedDuration: 0,
    captureFrame: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }

  await channelFrom(local, {}, source).close()

  expect(local.unpublishTrack).not.toHaveBeenCalled()
  expect(source.close).toHaveBeenCalledTimes(1)
})
