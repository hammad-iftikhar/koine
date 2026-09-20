import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from '../src/bus'

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

it('does not drop a live room on a stale unsubscribe', () => {
  // When a channel is torn down and recreated (normal lifecycle), a stale
  // unsubscribe closure must not delete the new room's Set. Sequence:
  // 1. subscribe h1, get off1
  // 2. off1() → h1 removed, room deleted (was empty)
  // 3. subscribe h2 to the same room → new Set created
  // 4. off1() again (stale closure) → must NOT delete the new Set
  // 5. publish → h2 must still receive
  const bus = createBus()
  const h1 = vi.fn()
  const h2 = vi.fn()

  const off1 = bus.subscribe('room-a', h1)
  off1()
  bus.subscribe('room-a', h2)
  off1() // Call stale off1 again
  bus.publish('room-a', segment())
  expect(h2).toHaveBeenCalledTimes(1)
})
