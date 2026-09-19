import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { auth, toHeaders } from './auth'
import { webOrigins } from './origins'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'

/** Builds the app without listening, so tests can use app.inject(). */
export async function buildApp(): Promise<FastifyInstance> {
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
  return app
}
