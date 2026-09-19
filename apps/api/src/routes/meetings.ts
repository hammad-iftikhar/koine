import { randomUUID } from 'node:crypto'
import {
  CreateMeetingBody,
  generateMeetingCode,
  JoinMeetingBody,
  normalizeMeetingCode,
} from '@koine/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSession } from '../auth'
import { db } from '../db/client'
import { meeting, participant } from '../db/schema'
import { signGuestToken } from '../guest'
import { mintAccessToken } from '../livekit'
import { consume } from '../rate-limit'

const LOOKUP_LIMIT = 10
const LOOKUP_WINDOW = 60

const MEETING_NOT_FOUND = 'Meeting code not found — check the code or ask the host for the link.'

async function currentUserId(request: FastifyRequest): Promise<string | null> {
  // Test seam: skips the OAuth round trip. Never honoured outside tests.
  if (process.env.NODE_ENV === 'test') {
    const header = request.headers['x-test-user']
    if (typeof header === 'string') return header
  }
  const result = await getSession(request)
  return result?.user?.id ?? null
}

/**
 * Same code-guessing defence on every route that takes a meeting code from
 * an unauthenticated caller: lookup, join and end all leak whether a code
 * exists (join by inserting, end by 404-vs-403), so all three are throttled
 * per IP, each in its own bucket.
 */
async function enforceRateLimit(request: FastifyRequest, reply: FastifyReply, bucket: string) {
  const { allowed } = await consume(`${bucket}:${request.ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW)
  if (!allowed)
    reply.status(429).send({ message: 'Too many attempts — wait a moment and try again.' })
  return allowed
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
    if (!(await enforceRateLimit(request, reply, 'lookup'))) return reply

    const code = normalizeMeetingCode(request.params.code)
    if (!code) {
      return reply.status(404).send({ message: MEETING_NOT_FOUND })
    }

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) {
      return reply.status(404).send({ message: MEETING_NOT_FOUND })
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
    if (!(await enforceRateLimit(request, reply, 'join'))) return reply

    const code = normalizeMeetingCode(request.params.code)
    if (!code) {
      return reply.status(404).send({ message: MEETING_NOT_FOUND })
    }

    const parsed = JoinMeetingBody.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ message: 'Pick a language you speak and one you want to hear.' })
    }

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) {
      return reply.status(404).send({ message: MEETING_NOT_FOUND })
    }
    if (found.endedAt) {
      return reply.status(410).send({ message: 'This meeting has ended.' })
    }

    const userId = await currentUserId(request)
    const participantId = `p_${randomUUID()}`

    // Minted before the insert: a LiveKit failure here must not leave a
    // phantom participant row (leftAt: null forever) in the roster and the
    // meeting marked started for a person who never actually joined.
    const livekitToken = await mintAccessToken({
      room: code,
      identity: participantId,
      name: parsed.data.displayName,
    })

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
      const code = normalizeMeetingCode(request.params.code)
      if (!code) return reply.status(404).send({ message: MEETING_NOT_FOUND })

      const id = request.body?.participantId
      if (!id) return reply.status(400).send({ message: 'Missing participant.' })

      const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
      if (!found) return reply.status(404).send({ message: MEETING_NOT_FOUND })

      // No guest-token or session check: the meeting code is the only
      // credential this route needs. What it must not do is trust the
      // participant id alone — that id is the LiveKit identity, broadcast to
      // every peer in the room, so scoping the update to this meeting stops
      // an id harvested in one meeting from leaving a participant in another.
      const updated = await db
        .update(participant)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(participant.id, id),
            eq(participant.meetingId, found.id),
            isNull(participant.leftAt),
          ),
        )
        .returning({ id: participant.id })

      if (updated.length === 0) return reply.status(404).send({ message: MEETING_NOT_FOUND })

      return { ok: true }
    },
  )

  app.post<{ Params: { code: string } }>('/api/meetings/:code/end', async (request, reply) => {
    if (!(await enforceRateLimit(request, reply, 'end'))) return reply

    const code = normalizeMeetingCode(request.params.code)
    if (!code) return reply.status(404).send({ message: MEETING_NOT_FOUND })

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) return reply.status(404).send({ message: MEETING_NOT_FOUND })

    const userId = await currentUserId(request)
    if (!userId || userId !== found.hostUserId) {
      return reply.status(403).send({ message: 'Only the host can end this meeting.' })
    }

    await db.update(meeting).set({ endedAt: new Date() }).where(eq(meeting.id, found.id))
    return { ok: true }
  })
}
