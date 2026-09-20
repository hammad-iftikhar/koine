import type Redis from 'ioredis'
import { expect, it, vi } from 'vitest'
import { createSpendTracker } from '@/spend'

// A stub, not a real Redis: incrby/expire are the only two calls this
// module makes, so that's the whole surface to fake.
function fakeRedis() {
  return {
    incrby: vi.fn(async (_key: string, _amount: number) => 0),
    expire: vi.fn(async (_key: string, _seconds: number) => 1),
  }
}

it('allows a total under the ceiling', async () => {
  const redis = fakeRedis()
  redis.incrby.mockResolvedValueOnce(50)
  const tracker = createSpendTracker(redis as unknown as Redis, 100)

  await expect(tracker.consume('room-a', 50)).resolves.toBe(true)
})

it('blocks a total over the ceiling', async () => {
  const redis = fakeRedis()
  redis.incrby.mockResolvedValueOnce(150)
  const tracker = createSpendTracker(redis as unknown as Redis, 100)

  await expect(tracker.consume('room-a', 150)).resolves.toBe(false)
})

it('allows a total exactly at the ceiling', async () => {
  const redis = fakeRedis()
  redis.incrby.mockResolvedValueOnce(100)
  const tracker = createSpendTracker(redis as unknown as Redis, 100)

  await expect(tracker.consume('room-a', 100)).resolves.toBe(true)
})

it('blocks a total one unit past the ceiling', async () => {
  const redis = fakeRedis()
  redis.incrby.mockResolvedValueOnce(101)
  const tracker = createSpendTracker(redis as unknown as Redis, 100)

  await expect(tracker.consume('room-a', 101)).resolves.toBe(false)
})

it('sets a 24h expiry on the first increment for a key, not on later ones', async () => {
  const redis = fakeRedis()
  const tracker = createSpendTracker(redis as unknown as Redis, 1000)

  redis.incrby.mockResolvedValueOnce(10)
  await tracker.consume('room-a', 10)
  expect(redis.expire).toHaveBeenCalledTimes(1)
  expect(redis.expire).toHaveBeenCalledWith('spend:room-a', 60 * 60 * 24)

  redis.incrby.mockResolvedValueOnce(20)
  await tracker.consume('room-a', 10)
  expect(redis.expire).toHaveBeenCalledTimes(1)
})

it('namespaces the counter key per room', async () => {
  const redis = fakeRedis()
  const tracker = createSpendTracker(redis as unknown as Redis, 1000)

  redis.incrby.mockResolvedValueOnce(10)
  await tracker.consume('room-a', 10)
  redis.incrby.mockResolvedValueOnce(10)
  await tracker.consume('room-b', 10)

  expect(redis.incrby).toHaveBeenNthCalledWith(1, 'spend:room-a', 10)
  expect(redis.incrby).toHaveBeenNthCalledWith(2, 'spend:room-b', 10)
  // Each room's first hit also gets its own expiry, on its own key.
  expect(redis.expire).toHaveBeenCalledWith('spend:room-a', 60 * 60 * 24)
  expect(redis.expire).toHaveBeenCalledWith('spend:room-b', 60 * 60 * 24)
})

it('increments atomically with incrby rather than reading then writing', async () => {
  const redis = fakeRedis()
  const tracker = createSpendTracker(redis as unknown as Redis, 1000)

  redis.incrby.mockResolvedValueOnce(10)
  await tracker.consume('room-a', 10)

  expect(redis.incrby).toHaveBeenCalledWith('spend:room-a', 10)
  expect(redis.incrby).toHaveBeenCalledTimes(1)
})
