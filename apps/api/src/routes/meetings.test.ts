import { formatMeetingCode } from '@koine/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { db } from '../db/client'
import { participant, user } from '../db/schema'
import { redis } from '../redis'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  // meeting.host_user_id and participant.user_id are real foreign keys to
  // `user`, so the x-test-user identities this file sends need a backing
  // row. onConflictDoNothing keeps repeated runs against the shared
  // database idempotent — these rows are never deleted (see leave/end
  // tests below; other test files may share these ids).
  for (const id of ['u_host', 'u_someone_else']) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@test.invalid` })
      .onConflictDoNothing()
  }
})
beforeEach(async () => {
  // Not redis.flushdb(): vitest runs test files in parallel processes against
  // one Redis database, and rate-limit.test.ts counts on keys that a flush
  // would zero mid-test. Clear only this file's own keys — lookup, join and
  // end are each their own bucket (see enforceRateLimit in meetings.ts).
  const patterns = ['rl:lookup:*', 'rl:join:*', 'rl:end:*']
  const keys = (await Promise.all(patterns.map((p) => redis.keys(p)))).flat()
  if (keys.length) await redis.del(...keys)
})
afterAll(async () => {
  await app.close()
  await redis.quit()
})

async function createMeeting() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/meetings',
    payload: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_host' },
  })
  return res.json() as { code: string }
}

it('creates a meeting with a valid code', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/meetings',
    payload: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_host' },
  })
  expect(res.statusCode).toBe(201)
  expect(formatMeetingCode(res.json().code)).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
})

it('refuses to create a meeting when signed out', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/meetings', payload: {} })
  expect(res.statusCode).toBe(401)
})

it('resolves a code regardless of case and dashes', async () => {
  const { code } = await createMeeting()
  const pretty = formatMeetingCode(code).toUpperCase().replace(/-/g, ' ')

  const res = await app.inject({
    method: 'GET',
    url: `/api/meetings/${encodeURIComponent(pretty)}`,
  })
  expect(res.statusCode).toBe(200)
  expect(res.json().code).toBe(code)
})

it('tells the user what to do when the code is unknown', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/meetings/aaaaaaaaaa' })
  expect(res.statusCode).toBe(404)
  expect(res.json().message).toMatch(/check the code or ask the host for the link/i)
})

it('answers a malformed code with 404, not a crash', async () => {
  // Fastify's router decodes '%25' to '%' with its own non-throwing decoder.
  // A second decodeURIComponent() on that lone '%' throws a URIError — this
  // proves the route no longer does that second decode.
  const res = await app.inject({ method: 'GET', url: '/api/meetings/%25' })
  expect(res.statusCode).toBe(404)
  expect(res.json().message).toMatch(/check the code or ask the host for the link/i)
})

it('mints a token and records the languages on join', async () => {
  const { code } = await createMeeting()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'Mariam', speakLang: 'es', hearLang: 'en' },
  })

  expect(res.statusCode).toBe(200)
  const body = res.json()
  expect(body.livekitToken).toBeTruthy()
  // A guest gets a scoped token; the languages must be on the row, because
  // plan 06 rebuilds the channel set from the database, not from clients.
  expect(body.guestToken).toBeTruthy()

  const detail = await app.inject({ method: 'GET', url: `/api/meetings/${code}` })
  expect(detail.json().participants).toHaveLength(1)

  // The roster response only carries {id, displayName} — it cannot prove
  // the languages reached the row. Read the column directly.
  const [row] = await db
    .select({ speakLang: participant.speakLang, hearLang: participant.hearLang })
    .from(participant)
    .where(eq(participant.id, body.participantId))
  expect(row).toEqual({ speakLang: 'es', hearLang: 'en' })
})

it('round-trips the floor sentinel as hearLang, not a language code', async () => {
  const { code } = await createMeeting()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'Kenji', speakLang: 'ja', hearLang: 'floor' },
  })

  expect(res.statusCode).toBe(200)
  const { participantId } = res.json()

  const [row] = await db
    .select({ hearLang: participant.hearLang })
    .from(participant)
    .where(eq(participant.id, participantId))
  expect(row?.hearLang).toBe('floor')
})

it('refuses to join an ended meeting', async () => {
  const { code } = await createMeeting()
  await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/end`,
    headers: { 'x-test-user': 'u_host' },
  })

  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'Late', speakLang: 'en', hearLang: 'en' },
  })
  expect(res.statusCode).toBe(410)
  expect(res.json().message).toMatch(/has ended/i)
})

it('refuses to end a meeting the caller does not host', async () => {
  const { code } = await createMeeting()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/end`,
    headers: { 'x-test-user': 'u_someone_else' },
  })
  expect(res.statusCode).toBe(403)
  expect(res.json().message).toMatch(/only the host/i)
})

it('rate limits code lookups', async () => {
  for (let i = 0; i < 10; i++) {
    await app.inject({ method: 'GET', url: '/api/meetings/aaaaaaaaaa' })
  }
  const res = await app.inject({ method: 'GET', url: '/api/meetings/aaaaaaaaaa' })
  expect(res.statusCode).toBe(429)
  expect(res.json().message).toMatch(/wait a moment/i)
})

it('rate limits joins in their own bucket, separate from lookups', async () => {
  const { code } = await createMeeting()

  for (let i = 0; i < 10; i++) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/meetings/${code}/join`,
      payload: { displayName: `Guest ${i}`, speakLang: 'en', hearLang: 'en' },
    })
    expect(res.statusCode, `attempt ${i + 1}`).toBe(200)
  }

  const blocked = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'One too many', speakLang: 'en', hearLang: 'en' },
  })
  expect(blocked.statusCode).toBe(429)
  expect(blocked.json().message).toMatch(/wait a moment/i)

  // Proves join and lookup are separate buckets, not one shared counter:
  // 11 straight joins from this IP have not touched the lookup limiter.
  const lookup = await app.inject({ method: 'GET', url: `/api/meetings/${code}` })
  expect(lookup.statusCode).toBe(200)
})

it('rejects a join with an unknown language', async () => {
  const { code } = await createMeeting()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'X', speakLang: 'klingon', hearLang: 'en' },
  })
  expect(res.statusCode).toBe(400)
})

it('refuses to leave through a meeting the participant did not join', async () => {
  const meetingA = await createMeeting()
  const meetingB = await createMeeting()

  const joinRes = await app.inject({
    method: 'POST',
    url: `/api/meetings/${meetingA.code}/join`,
    payload: { displayName: 'Ann', speakLang: 'en', hearLang: 'en' },
  })
  const { participantId } = joinRes.json()

  // The id is a LiveKit identity, broadcast to every peer — harvesting it in
  // meeting B's room must not let anyone leave a participant in meeting A.
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${meetingB.code}/leave`,
    payload: { participantId },
  })
  expect(res.statusCode).toBe(404)

  const detail = await app.inject({ method: 'GET', url: `/api/meetings/${meetingA.code}` })
  expect(detail.json().participants.map((p: { id: string }) => p.id)).toContain(participantId)
})

it('leaving marks the row and drops it from the roster', async () => {
  const { code } = await createMeeting()
  const joinRes = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'Ben', speakLang: 'en', hearLang: 'en' },
  })
  const { participantId } = joinRes.json()

  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/leave`,
    payload: { participantId },
  })
  expect(res.statusCode).toBe(200)

  const detail = await app.inject({ method: 'GET', url: `/api/meetings/${code}` })
  expect(detail.json().participants).toHaveLength(0)
})
