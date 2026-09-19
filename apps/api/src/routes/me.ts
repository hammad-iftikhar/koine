import type { FastifyInstance, FastifyRequest } from 'fastify'
import { auth } from '../auth'

/** Converts Fastify headers into the Headers object Better Auth expects. */
export function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  return headers
}

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', async (request) => {
    const result = await auth.api.getSession({ headers: toHeaders(request) })
    if (!result?.user) return { user: null }

    const { id, name, email, image } = result.user
    return { user: { id, name, email, image: image ?? null } }
  })
}
