import type { MeResponse } from '@koine/shared'
import type { FastifyInstance } from 'fastify'
import { getSession } from '../auth'

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', async (request): Promise<MeResponse> => {
    const result = await getSession(request)
    if (!result?.user) return { user: null }

    const { id, name, email, image } = result.user
    return { user: { id, name, email, image: image ?? null } }
  })
}
