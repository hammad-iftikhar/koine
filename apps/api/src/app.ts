import Fastify, { type FastifyInstance } from 'fastify'
import { healthRoutes } from './routes/health'

/** Builds the app without listening, so tests can use app.inject(). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(healthRoutes)
  return app
}
