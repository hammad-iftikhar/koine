import { randomUUID } from 'node:crypto'
import {
  CreateMeetingBody,
  generateMeetingCode,
  JoinMeetingBody,
  normalizeMeetingCode,
} from '@koine/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getSession } from '../auth'
import { db } from '../db/client'
import { meeting, participant, user } from '../db/schema'
import { signGuestToken } from '../guest'
import { mintAccessToken } from '../livekit'
import { consume } from '../rate-limit'

const LOOKUP_LIMIT = 10
const LOOKUP_WINDOW = 60

async function currentUserId(request: FastifyRequest): Promise<string | null> {
  // Test seam: skips the OAuth round trip. Never honoured outside tests.
  if (process.env.NODE_ENV === 'test') {
    const header = request.headers['x-test-user']
    if (typeof header === 'string') {
      // meeting.host_user_id and participant.user_id carry a real foreign
      // key to `user` (task 1). Without a backing row, using this id as a
      // host or participant would violate that constraint on insert.
      await db
        .insert(user)
        .values({ id: header, name: header, email: `${header}@test.invalid` })
        .onConflictDoNothing()
      return header
    }
  }
  const result = await getSession(request)
  return result?.user?.id ?? null
}

export async function meetingRoutes(app: FastifyInstance) {
  app.post('/api/meetings', async (request, reply) => {
    const userId = await currentUserId(request)
    if (!userId) {
      return reply.status(401).send({ message: 'Sign in to start a meeting.' })
    }

    const parsed = CreateMeetingBody.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ message: 'That meeting could not be created. Check the language and try again.' })
    }

    const code = normalizeMeetingCode(generateMeetingCode())
    if (!code) throw new Error('generated an invalid meeting code')

    await db.insert(meeting).values({
      id: randomUUID(),
      code,
      title: parsed.data.title ?? null,
      hostUserId: userId,
      floorLang: parsed.data.floorLang,
    })

    return reply.status(201).send({ code })
  })

  app.get<{ Params: { code: string } }>('/api/meetings/:code', async (request, reply) => {
    const ip = request.ip
    const { allowed } = await consume(`lookup:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW)
    if (!allowed) {
      return reply.status(429).send({ message: 'Too many attempts — wait a moment and try again.' })
    }

    const code = normalizeMeetingCode(decodeURIComponent(request.params.code))
    if (!code) {
      return reply.status(404).send({
        message: 'Meeting code not found — check the code or ask the host for the link.',
      })
    }

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) {
      return reply.status(404).send({
        message: 'Meeting code not found — check the code or ask the host for the link.',
      })
    }

    const people = await db
      .select({ id: participant.id, displayName: participant.displayName })
      .from(participant)
      .where(and(eq(participant.meetingId, found.id), isNull(participant.leftAt)))

    return {
      code: found.code,
      title: found.title,
      floorLang: found.floorLang,
      ended: found.endedAt !== null,
      participants: people,
    }
  })

  app.post<{ Params: { code: string } }>('/api/meetings/:code/join', async (request, reply) => {
    const code = normalizeMeetingCode(request.params.code)
    if (!code) {
      return reply.status(404).send({
        message: 'Meeting code not found — check the code or ask the host for the link.',
      })
    }

    const parsed = JoinMeetingBody.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ message: 'Pick a language you speak and one you want to hear.' })
    }

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) {
      return reply.status(404).send({
        message: 'Meeting code not found — check the code or ask the host for the link.',
      })
    }
    if (found.endedAt) {
      return reply.status(410).send({ message: 'This meeting has ended.' })
    }

    const userId = await currentUserId(request)
    const participantId = `p_${randomUUID()}`

    await db.insert(participant).values({
      id: participantId,
      meetingId: found.id,
      userId,
      displayName: parsed.data.displayName,
      speakLang: parsed.data.speakLang,
      hearLang: parsed.data.hearLang,
      role: userId === found.hostUserId ? 'host' : 'guest',
    })

    if (!found.startedAt) {
      await db.update(meeting).set({ startedAt: new Date() }).where(eq(meeting.id, found.id))
    }

    // Minted only now, after the code resolved and the meeting was confirmed live.
    const livekitToken = await mintAccessToken({
      room: code,
      identity: participantId,
      name: parsed.data.displayName,
    })

    return {
      livekitToken,
      livekitUrl: process.env.LIVEKIT_PUBLIC_URL ?? 'ws://localhost:7880',
      identity: participantId,
      participantId,
      guestToken: userId
        ? null
        : signGuestToken({
            meetingCode: code,
            displayName: parsed.data.displayName,
            speakLang: parsed.data.speakLang,
            hearLang: parsed.data.hearLang,
          }),
    }
  })

  app.post<{ Params: { code: string }; Body: { participantId?: string } }>(
    '/api/meetings/:code/leave',
    async (request, reply) => {
      const id = request.body?.participantId
      if (!id) return reply.status(400).send({ message: 'Missing participant.' })
      await db.update(participant).set({ leftAt: new Date() }).where(eq(participant.id, id))
      return { ok: true }
    },
  )

  app.post<{ Params: { code: string } }>('/api/meetings/:code/end', async (request, reply) => {
    const code = normalizeMeetingCode(request.params.code)
    if (!code) return reply.status(404).send({ message: 'Meeting code not found.' })

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) return reply.status(404).send({ message: 'Meeting code not found.' })

    const userId = await currentUserId(request)
    if (!userId || userId !== found.hostUserId) {
      return reply.status(403).send({ message: 'Only the host can end this meeting.' })
    }

    await db.update(meeting).set({ endedAt: new Date() }).where(eq(meeting.id, found.id))
    return { ok: true }
  })
}
