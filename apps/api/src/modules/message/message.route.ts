import type { FastifyInstance } from 'fastify'
import { listMessagesForReader, postMessage } from './message.controller'

export async function messageRoutes(app: FastifyInstance) {
  app.post<{ Params: { code: string } }>('/api/meetings/:code/messages', postMessage)
  app.get<{ Params: { code: string }; Querystring: { hear?: string } }>(
    '/api/meetings/:code/messages',
    listMessagesForReader,
  )
}
