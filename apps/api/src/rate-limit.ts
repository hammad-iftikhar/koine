import { redis } from './redis'

/**
 * Fixed-window counter. INCR then EXPIRE in one pipeline so the two cannot
 * interleave with another instance's — an INCR that never gets its TTL is a
 * counter that blocks the key forever.
 *
 * ponytail: fixed window, not sliding. A burst can straddle a boundary and get
 * ~2x the limit; that is acceptable for code-guessing defence. Swap to a sliding
 * window if this ever guards something priced per call.
 */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const redisKey = `rl:${key}`
  const [incr] = (await redis
    .multi()
    .incr(redisKey)
    .expire(redisKey, windowSeconds, 'NX')
    .exec()) as [[Error | null, number], ...unknown[]]

  const count = incr[1]
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}
