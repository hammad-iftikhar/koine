import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'
import { createTranscriber } from './transcriber'

function stubClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    transcribe: vi.fn(async () => 'Se movió la fecha al viernes.'),
    translate: vi.fn(async (_t: string, _f: string, to: string[]) =>
      Object.fromEntries(to.map((lang) => [lang, `[${lang}] The deadline moved to Friday.`])),
    ),
    synthesize: vi.fn(async () => Buffer.alloc(0)),
    ...over,
  }
}

it('publishes a segment carrying the original and every channel translation', async () => {
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient()
  const transcriber = createTranscriber({ client, bus, channels: () => ['en', 'ur'] })
  await transcriber.onAudio('room-a', 'p_1', Buffer.from('audio'), 'es')

  expect(seen).toHaveLength(1)
  expect(seen[0]?.original).toBe('Se movió la fecha al viernes.')
  expect(Object.keys(seen[0]?.translations ?? {}).sort()).toEqual(['en', 'ur'])
  // One translate call for all targets, not one per target.
  expect(client.translate).toHaveBeenCalledTimes(1)
})

it('calls no OpenAI endpoint at all when no channel is active', async () => {
  // Everyone hears the floor language. Calling OpenAI here is money for
  // nothing — and the transcription is the expensive half, billed once per
  // speaker per window for a segment nothing downstream would render.
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))
  const client = stubClient()
  const transcriber = createTranscriber({ client, bus, channels: () => [] })

  await transcriber.onAudio('room-a', 'p_1', Buffer.from('audio'), 'es')
  expect(client.transcribe).not.toHaveBeenCalled()
  expect(client.translate).not.toHaveBeenCalled()
  expect(seen).toHaveLength(0)
})

it('still publishes captions when translation fails', async () => {
  // Degradation, not silence: the original is always worth showing.
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient({
    translate: vi.fn(async () => {
      throw new Error('rate limited')
    }),
  })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await expect(
    transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es'),
  ).resolves.toBeUndefined()
  expect(seen).toHaveLength(1)
  expect(seen[0]?.original).toBeTruthy()
  expect(seen[0]?.translations).toEqual({})
})

it('publishes nothing when transcription returns empty', async () => {
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient({ transcribe: vi.fn(async () => '   ') })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es')
  expect(seen).toHaveLength(0)
})

it('swallows a transcription failure rather than killing the room', async () => {
  const bus = createBus()
  const client = stubClient({
    transcribe: vi.fn(async () => {
      throw new Error('stt down')
    }),
  })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await expect(
    transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es'),
  ).resolves.toBeUndefined()
})
