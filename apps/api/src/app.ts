import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { healthRoutes } from '@/modules/health/health.route'
import { meRoutes } from '@/modules/me/me.route'
import { meetingRoutes } from '@/modules/meeting/meeting.route'
import { messageRoutes } from '@/modules/message/message.route'
import { auth as defaultAuth, toHeaders } from './auth'
import { webOrigins } from './origins'

/**
 * Builds the app without listening, so tests can use app.inject().
 *
 * `auth` defaults to the module singleton (bound to the shared DATABASE_URL
 * database) so server.ts and every other caller are unaffected. Tests that
 * drive /api/auth/* pass one from createAuth(withTestDb().db) instead, so
 * they exercise an isolated database rather than writing into the shared one.
 */
export async function buildApp(
  auth: Pick<typeof defaultAuth, 'handler'> = defaultAuth,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Explicit allow-list, never `*` or a reflect-any-origin function: combined
  // with credentials: true, either of those would open a CSRF hole. webOrigins()
  // rejects a `*` entry outright — see ./origins.
  await app.register(cors, { origin: webOrigins(), credentials: true })

  // Better Auth handles its own routes under /api/auth/*.
  app.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    const headers = toHeaders(request)
    // The body is re-serialized below, so the client's framing headers no
    // longer describe it. Forwarding them invites a length mismatch the day
    // a request body round-trips to something a different size.
    headers.delete('content-length')
    headers.delete('content-encoding')
    // Better Auth reads the client IP from x-forwarded-for, and this handler
    // hands it a Request built from scratch with no connection behind it.
    // Without this line every caller shares one rate-limit bucket, so a
    // single attacker locks everyone out of sign-in. set() overwrites rather
    // than appends, so a client cannot spoof its way into a fresh bucket.
    // Correct only because the API is exposed directly and Fastify's
    // `trustProxy` is off, so request.ip is always the real peer address.
    // Putting this behind an ingress or load balancer means turning
    // `trustProxy` on AND switching this to read the trusted hop off the
    // inbound x-forwarded-for via Better Auth's advanced.ipAddress.trustedProxies
    // in the same change — otherwise every user again collapses into one bucket.
    headers.set('x-forwarded-for', request.ip)

    const response = await auth.handler(
      new Request(url, {
        method: request.method,
        headers,
        body:
          request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : JSON.stringify(request.body),
      }),
    )
    reply.status(response.status)
    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })
    return reply.send(await response.text())
  })

  await app.register(healthRoutes)
  await app.register(meRoutes)
  await app.register(meetingRoutes)
  await app.register(messageRoutes)
  return app
}
