import { expect, it, vi } from 'vitest'
import { createIngest } from '@/ingest'
import type { FullRoster } from '@/room'

const ROSTER: FullRoster = {
  floorLang: 'es',
  participants: [
    { identity: 'p1', hearLang: 'en', speakLang: 'ur' },
    { identity: 'p2', hearLang: 'floor', speakLang: 'es' },
  ],
}

type OnAudio = (
  roomId: string,
  speakerIdentity: string,
  audio: Buffer,
  sourceLang: string,
) => Promise<void>

/** One second of silence at 1 kHz, in ten frames. */
async function* frames(count = 10) {
  for (let i = 0; i < count; i++) yield { data: new Int16Array(100) }
}

function ingest(load: (roomId: string) => Promise<FullRoster>) {
  const onAudio = vi.fn<OnAudio>(async () => {})
  const listener = createIngest({
    loadRoster: load,
    transcriber: { onAudio },
    sampleRate: 1000,
    windowMs: 500,
  })
  return { listener, onAudio }
}

it('transcribes each window in the language the speaker speaks', async () => {
  const { listener, onAudio } = ingest(async () => ROSTER)

  await listener.listen('room-a', 'p1', frames())

  // 1000 samples at 1 kHz in 500 ms windows: two utterances.
  expect(onAudio).toHaveBeenCalledTimes(2)
  expect(onAudio.mock.calls[0]?.[0]).toBe('room-a')
  expect(onAudio.mock.calls[0]?.[1]).toBe('p1')
  expect(onAudio.mock.calls[0]?.[3]).toBe('ur')
  expect(onAudio.mock.calls[0]?.[2].subarray(0, 4).toString('ascii')).toBe('RIFF')
})

it('falls back to the floor language for a speaker the roster does not know', async () => {
  const { listener, onAudio } = ingest(async () => ROSTER)

  await listener.listen('room-a', 'joined-since-the-last-read', frames())

  expect(onAudio.mock.calls[0]?.[3]).toBe('es')
})

it('keeps transcribing in the last known floor language when the roster read fails', async () => {
  // There is no second TrackSubscribed for a track already subscribed, so
  // dropping the speaker here would silence them for the whole meeting.
  const load = vi
    .fn<(roomId: string) => Promise<FullRoster>>()
    .mockResolvedValueOnce(ROSTER)
    .mockRejectedValueOnce(new Error('db down'))
  const { listener, onAudio } = ingest(load)

  await listener.listen('room-a', 'p1', frames())
  await listener.listen('room-a', 'p1', frames())

  expect(load).toHaveBeenCalledTimes(2)
  expect(onAudio).toHaveBeenCalledTimes(4)
  expect(onAudio.mock.calls[2]?.[3]).toBe('es')
})

it('falls back to the default language when the roster has never been read', async () => {
  const { listener, onAudio } = ingest(async () => {
    throw new Error('db down')
  })

  await listener.listen('room-a', 'p1', frames())

  expect(onAudio.mock.calls[0]?.[3]).toBe('en')
})

it('logs a failed transcription instead of rejecting', async () => {
  const onAudio = vi.fn<OnAudio>(async () => {
    throw new Error('stt exploded')
  })
  const listener = createIngest({
    loadRoster: async () => ROSTER,
    transcriber: { onAudio },
    sampleRate: 1000,
    windowMs: 500,
  })

  await expect(listener.listen('room-a', 'p1', frames())).resolves.toBeUndefined()
})
