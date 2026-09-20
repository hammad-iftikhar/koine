import type { FastifyInstance } from 'fastify'
import { getMe } from '@/modules/me/me.controller'

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', getMe)
}
