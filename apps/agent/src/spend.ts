import type Redis from 'ioredis'

export const DEFAULT_CEILING_UNITS = 200_000

/**
 * Per-meeting spend ceiling, counted in Redis with an atomic increment.
 *
 * The agent fleet is multi-process and a room can move between workers, so a
 * counter in process memory is wrong the moment anything restarts.
 */
export function createSpendTracker(redis: Redis, ceiling = DEFAULT_CEILING_UNITS) {
  return {
    async consume(roomId: string, units: number): Promise<boolean> {
      const key = `spend:${roomId}`
      const total = await redis.incrby(key, units)
      // 24h: long enough for any meeting, short enough that the key expires.
      if (total === units) await redis.expire(key, 60 * 60 * 24)
      return total <= ceiling
    },
  }
}
