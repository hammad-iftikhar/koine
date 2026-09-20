import type { FastifyInstance } from 'fastify'
import {
  createMeeting,
  endMeeting,
  joinMeeting,
  leaveMeeting,
  lookupMeeting,
} from './meeting.controller'

export async function meetingRoutes(app: FastifyInstance) {
  app.post('/api/meetings', createMeeting)
  app.get<{ Params: { code: string } }>('/api/meetings/:code', lookupMeeting)
  app.post<{ Params: { code: string } }>('/api/meetings/:code/join', joinMeeting)
  app.post<{ Params: { code: string }; Body: { participantId?: string } }>(
    '/api/meetings/:code/leave',
    leaveMeeting,
  )
  app.post<{ Params: { code: string } }>('/api/meetings/:code/end', endMeeting)
}
