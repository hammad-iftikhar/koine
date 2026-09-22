import { randomUUID } from 'node:crypto'
import {
  CreateMeetingBody,
  generateMeetingCode,
  JoinMeetingBody,
  normalizeMeetingCode,
} from '@koine/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  ACTION_LIMIT,
  ACTION_WINDOW,
  currentUserId,
  enforceRateLimit,
  LOOKUP_LIMIT,
  LOOKUP_WINDOW,
} from '../../guards'
import { signGuestToken } from '../../guest'
import { mintAccessToken } from '../../livekit'
import {
  findActiveParticipants,
  findMeetingByCode,
  insertMeeting,
  insertParticipant,
  markMeetingEnded,
  markMeetingStarted,
  markParticipantLeft,
} from './meeting.repository'

export const MEETING_NOT_FOUND =
  'Meeting code not found — check the code or ask the host for the link.'

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

export async function createMeeting(request: FastifyRequest, reply: FastifyReply) {
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

  await insertMeeting({
    id: randomUUID(),
    code,
    title: parsed.data.title ?? null,
    hostUserId: userId,
    floorLang: parsed.data.floorLang,
  })

  return reply.status(201).send({ code })
}

export async function lookupMeeting(
  request: FastifyRequest<{ Params: { code: string } }>,
  reply: FastifyReply,
) {
  if (!(await enforceRateLimit(request, reply, 'lookup', LOOKUP_LIMIT, LOOKUP_WINDOW))) return reply

  const code = normalizeMeetingCode(request.params.code)
  if (!code) {
    return reply.status(404).send({ message: MEETING_NOT_FOUND })
  }

  const found = await findMeetingByCode(code)
  if (!found) {
    return reply.status(404).send({ message: MEETING_NOT_FOUND })
  }

  const people = await findActiveParticipants(found.id)

  return {
    code: found.code,
    title: found.title,
    floorLang: found.floorLang,
    ended: found.endedAt !== null,
    participants: people,
  }
}

export async function joinMeeting(
  request: FastifyRequest<{ Params: { code: string } }>,
  reply: FastifyReply,
) {
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

  const found = await findMeetingByCode(code)
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

  const inserted = await insertParticipant({
    id: participantId,
    meetingId: found.id,
    userId,
    displayName: parsed.data.displayName,
    speakLang: parsed.data.speakLang,
    hearLang: parsed.data.hearLang,
    role: userId === found.hostUserId ? 'host' : 'guest',
  })

  if (!found.startedAt) {
    await markMeetingStarted(found.id)
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
}

export async function leaveMeeting(
  request: FastifyRequest<{ Params: { code: string }; Body: { participantId?: string } }>,
  reply: FastifyReply,
) {
  const code = normalizeMeetingCode(request.params.code)
  if (!code) return reply.status(404).send({ message: MEETING_NOT_FOUND })

  const id = request.body?.participantId
  if (!id) return reply.status(400).send({ message: 'Missing participant.' })

  const found = await findMeetingByCode(code)
  if (!found) return reply.status(404).send({ message: MEETING_NOT_FOUND })

  // No guest-token or session check: the meeting code is the only credential
  // this route needs. What it must not do is trust the participant id alone —
  // see markParticipantLeft for why the update is scoped to this meeting.
  if (!(await markParticipantLeft(id, found.id))) {
    return reply.status(404).send({ message: MEETING_NOT_FOUND })
  }

  return { ok: true }
}

export async function endMeeting(
  request: FastifyRequest<{ Params: { code: string } }>,
  reply: FastifyReply,
) {
  if (!(await enforceRateLimit(request, reply, 'end', ACTION_LIMIT, ACTION_WINDOW))) return reply

  const code = normalizeMeetingCode(request.params.code)
  if (!code) return reply.status(404).send({ message: MEETING_NOT_FOUND })

  const found = await findMeetingByCode(code)
  if (!found) return reply.status(404).send({ message: MEETING_NOT_FOUND })

  const userId = await currentUserId(request)
  if (!userId || userId !== found.hostUserId) {
    return reply.status(403).send({ message: 'Only the host can end this meeting.' })
  }

  await markMeetingEnded(found.id)
  return { ok: true }
}
