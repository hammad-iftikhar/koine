import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { auth } from './auth'
import { healthRoutes } from './routes/health'
import { meRoutes, toHeaders } from './routes/me'

const DEFAULT_WEB_ORIGINS = 'http://localhost:5173,http://localhost:4173'

/** Builds the app without listening, so tests can use app.inject(). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Explicit allow-list, never `*` or a reflect-any-origin function: combined
  // with credentials: true, either of those would open a CSRF hole.
  const webOrigins = (process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
  await app.register(cors, { origin: webOrigins, credentials: true })

  // Better Auth handles its own routes under /api/auth/*.
  app.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    const response = await auth.handler(
      new Request(url, {
        method: request.method,
        headers: toHeaders(request),
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
