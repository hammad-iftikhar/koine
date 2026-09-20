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

// Lookup is unauthenticated code-guessing surface, so it stays tight — the
// spec's test list names the eleventh lookup from one IP specifically.
const LOOKUP_LIMIT = 10
const LOOKUP_WINDOW = 60

// Join and end share a separate, larger bucket: a shared office NAT can put
// a dozen legitimate colleagues behind one IP, and the tenth-plus person
// joining or ending their own meeting is not the code-guessing attack this
// defends against.
const ACTION_LIMIT = 30
const ACTION_WINDOW = 60

const MEETING_NOT_FOUND = 'Meeting code not found — check the code or ask the host for the link.'

/**
 * R25: `livekitUrl` stays in the join response — plan 05 consumes it — but a
 * silent `ws://localhost:7880` default in production is a broken call
 * nobody can debug from the client side. Dev keeps the default; production
 * must set the browser-reachable URL explicitly or fail loudly at request
 * time instead of minting a token nobody can connect with.
 */
function livekitPublicUrl(): string {
  const url = process.env.LIVEKIT_PUBLIC_URL
  if (url) return url
  if (process.env.NODE_ENV === 'production') {
    throw new Error('LIVEKIT_PUBLIC_URL must be set in production')
  }
  return 'ws://localhost:7880'
}

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
 *
 * R24: the limiter fails OPEN. The meeting code is the primary defence here
 * and is entropy nobody can guess in ten years; the limiter is a secondary
 * belt-and-braces check. A Redis blip must not stop people joining calls, so
 * a failure from `consume` is logged and the request is let through rather
 * than turning an infrastructure fault into a 500 for every meeting route.
 */
async function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  let allowed: boolean
  try {
    ;({ allowed } = await consume(`${bucket}:${request.ip}`, limit, windowSeconds))
  } catch (error) {
    request.log.warn({ error, bucket }, 'rate limiter unavailable, allowing request through')
    return true
  }
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
    if (!(await enforceRateLimit(request, reply, 'lookup', LOOKUP_LIMIT, LOOKUP_WINDOW)))
      return reply

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
    if (!(await enforceRateLimit(request, reply, 'join', ACTION_LIMIT, ACTION_WINDOW))) return reply

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
    // meeting marked started for a person who never actually joined. The
    // public URL is resolved here too, in the same fail-before-writing
    // group — it can throw in production (see livekitPublicUrl), and that
    // throw must land before the insert for the same reason the mint does.
    //
    // R22: room is deliberately the meeting's id, not its code. The code is
    // this system's only credential and it never rotates, while room names
    // reach LiveKit's server logs, webhooks, metrics labels and dashboard —
    // pinning the room to the code would leak a permanent join credential
    // into every observability surface. Do not "fix" this back to `code`.
    const livekitToken = await mintAccessToken({
      room: found.id,
      identity: participantId,
      name: parsed.data.displayName,
    })
    const livekitUrl = livekitPublicUrl()

    // `returning` rather than echoing the request body: the client picks its
    // `tr:<hearLang>` track name from this response while the agent derives
    // the channel set from this very row (its roster loader selects
    // `p.hear_lang`). Read back, the two cannot drift — if a normalisation
    // ever lands on the write path, the client follows it instead of
    // subscribing to a channel that does not exist and hearing silence with
    // no error anywhere.
    const [inserted] = await db
      .insert(participant)
      .values({
        id: participantId,
        meetingId: found.id,
        userId,
        displayName: parsed.data.displayName,
        speakLang: parsed.data.speakLang,
        hearLang: parsed.data.hearLang,
        role: userId === found.hostUserId ? 'host' : 'guest',
      })
      .returning({ hearLang: participant.hearLang })
    if (!inserted) throw new Error('join: participant insert returned no row')

    if (!found.startedAt) {
      await db.update(meeting).set({ startedAt: new Date() }).where(eq(meeting.id, found.id))
    }

    return {
      livekitToken,
      livekitUrl,
      identity: participantId,
      participantId,
      // The stored row, read back. Plan 06's web client picks its single
      // translation channel from this, so it is a contract two apps depend
      // on rather than an echo for convenience.
      hearLang: inserted.hearLang,
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
    if (!(await enforceRateLimit(request, reply, 'end', ACTION_LIMIT, ACTION_WINDOW))) return reply

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
