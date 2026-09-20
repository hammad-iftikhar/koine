import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'
import { createSynthesizer } from './synthesizer'

const segment = (translations: Record<string, string>): CaptionSegment => ({
  speakerIdentity: 'p_1',
  sourceLang: 'es',
  original: 'Se movió la fecha al viernes.',
  translations,
  final: true,
  at: Date.now(),
})

function harness(over: { allowed?: boolean } = {}) {
  const bus = createBus()
  const client = {
    transcribe: vi.fn(),
    translate: vi.fn(),
    synthesize: vi.fn(async (_text: string, _lang: string) => Buffer.from('audio')),
  }
  const publishAudio = vi.fn(async (_audio: Buffer, _lang: string, _roomId: string) => {})
  const spend = { consume: vi.fn(async () => over.allowed ?? true) }
  const synth = createSynthesizer({ client, bus, publishAudio, spend })
  return { bus, client, publishAudio, spend, synth }
}

it('publishes one track per translated language', async () => {
  const h = harness()
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'The deadline moved to Friday.', ur: 'ڈیڈ لائن...' }))
  await vi.waitFor(() => expect(h.publishAudio).toHaveBeenCalledTimes(2))

  expect(h.publishAudio.mock.calls.map((c) => c[1]).sort()).toEqual(['en', 'ur'])
})

it('synthesizes nothing when translation failed', async () => {
  const h = harness()
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({}))
  await new Promise((r) => setTimeout(r, 20))
  expect(h.client.synthesize).not.toHaveBeenCalled()
})

it('stops synthesizing when the spend ceiling is hit', async () => {
  // Degrade to captions rather than run up an unbounded bill.
  const h = harness({ allowed: false })
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'Hello' }))
  await new Promise((r) => setTimeout(r, 20))

  expect(h.client.synthesize).not.toHaveBeenCalled()
  expect(h.publishAudio).not.toHaveBeenCalled()
})

it('one language failing does not stop the others', async () => {
  const h = harness()
  h.client.synthesize = vi.fn(async (_text: string, lang: string) => {
    if (lang === 'en') throw new Error('tts failed')
    return Buffer.from('audio')
  })
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'Hello', ur: 'ہیلو' }))
  await vi.waitFor(() => expect(h.publishAudio).toHaveBeenCalledTimes(1))
  expect(h.publishAudio.mock.calls[0]?.[1]).toBe('ur')
})

it('detaching stops further synthesis', async () => {
  const h = harness()
  const detach = h.synth.attach('room-a')
  detach()

  h.bus.publish('room-a', segment({ en: 'Hello' }))
  await new Promise((r) => setTimeout(r, 20))
  expect(h.client.synthesize).not.toHaveBeenCalled()
})
