import type { FastifyReply, FastifyRequest } from 'fastify'
import { getSession } from './auth'
import { consume } from './rate-limit'

// Lookup is unauthenticated code-guessing surface, so it stays tight — the
// spec's test list names the eleventh lookup from one IP specifically.
export const LOOKUP_LIMIT = 10
export const LOOKUP_WINDOW = 60

// Join and end share a separate, larger bucket: a shared office NAT can put
// a dozen legitimate colleagues behind one IP, and the tenth-plus person
// joining or ending their own meeting is not the code-guessing attack this
// defends against.
export const ACTION_LIMIT = 30
export const ACTION_WINDOW = 60

export async function currentUserId(request: FastifyRequest): Promise<string | null> {
  // Test seam: skips the OAuth round trip. Never honoured outside tests.
  if (process.env.NODE_ENV === 'test') {
    const header = request.headers['x-test-user']
    if (typeof header === 'string') return header
  }
  const result = await getSession(request)
  return result?.user?.id ?? null
}

/**
 * Same code-guessing defence on every route that takes a meeting code from
 * an unauthenticated caller: lookup, join and end all leak whether a code
 * exists (join by inserting, end by 404-vs-403), so all three are throttled
 * per IP, each in its own bucket. The message routes take a meeting code the
 * same way and reuse this same helper and constants, one more bucket apiece.
 *
 * R24: the limiter fails OPEN. The meeting code is the primary defence here
 * and is entropy nobody can guess in ten years; the limiter is a secondary
 * belt-and-braces check. A Redis blip must not stop people joining calls, so
 * a failure from `consume` is logged and the request is let through rather
 * than turning an infrastructure fault into a 500 for every meeting route.
 *
 * `consume` is called through the `@/rate-limit` module binding on purpose —
 * tests spy on that export to drive the fail-open path.
 */
export async function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  let allowed: boolean
  try {
    ;({ allowed } = await consume(`${bucket}:${request.ip}`, limit, windowSeconds))
  } catch (error) {
    request.log.warn({ error, bucket }, 'rate limiter unavailable, allowing request through')
    return true
  }
  if (!allowed)
    reply.status(429).send({ message: 'Too many attempts — wait a moment and try again.' })
  return allowed
}
