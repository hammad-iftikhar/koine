import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'

const segment = (over: Partial<CaptionSegment> = {}): CaptionSegment => ({
  speakerIdentity: 'p_1',
  sourceLang: 'es',
  original: 'Hola',
  translations: { en: 'Hello' },
  final: true,
  at: Date.now(),
  ...over,
})

it('delivers to subscribers of the same room', () => {
  const bus = createBus()
  const handler = vi.fn()
  bus.subscribe('room-a', handler)

  bus.publish('room-a', segment())
  expect(handler).toHaveBeenCalledTimes(1)
})

it('does not leak between rooms', () => {
  // One worker serves many rooms. A leak here puts one meeting's words into
  // another meeting's captions.
  const bus = createBus()
  const a = vi.fn()
  const b = vi.fn()
  bus.subscribe('room-a', a)
  bus.subscribe('room-b', b)

  bus.publish('room-a', segment())
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).not.toHaveBeenCalled()
})

it('stops delivering after unsubscribe', () => {
  const bus = createBus()
  const handler = vi.fn()
  const off = bus.subscribe('room-a', handler)

  off()
  bus.publish('room-a', segment())
  expect(handler).not.toHaveBeenCalled()
})

it('one subscriber throwing does not stop the others', () => {
  // A synthesizer failing for one language must not silence every other language.
  const bus = createBus()
  const bad = vi.fn(() => {
    throw new Error('tts exploded')
  })
  const good = vi.fn()
  bus.subscribe('room-a', bad)
  bus.subscribe('room-a', good)

  expect(() => bus.publish('room-a', segment())).not.toThrow()
  expect(good).toHaveBeenCalledTimes(1)
})
