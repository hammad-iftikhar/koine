import { expect, it, vi } from 'vitest'
import { createDucker, DUCK_GAIN } from './ducking'

function fakeContext() {
  // `connect` is part of the fake because a real GainNode is wired to the
  // destination on construction — a stub without it fails before the first
  // assertion runs, which would test the stub rather than the ducker.
  const gain = { gain: { value: 1 }, connect: vi.fn() }
  return {
    createGain: vi.fn(() => gain),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    destination: {},
    gain,
  }
}

it('ducks the floor to the configured gain, not to silence', () => {
  // Muting the original entirely feels wrong: people take tone and turn-taking
  // from it even when they cannot parse the words.
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)

  ducker.setDucked(true)
  expect(ctx.gain.gain.value).toBe(DUCK_GAIN)
  expect(DUCK_GAIN).toBeGreaterThan(0)
})

it('restores full gain when translation stops', () => {
  // If the agent dies, the listener must hear the room again immediately.
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)

  ducker.setDucked(true)
  ducker.setDucked(false)
  expect(ctx.gain.gain.value).toBe(1)
})

it('is idempotent', () => {
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)
  ducker.setDucked(true)
  ducker.setDucked(true)
  expect(ctx.gain.gain.value).toBe(DUCK_GAIN)
})
