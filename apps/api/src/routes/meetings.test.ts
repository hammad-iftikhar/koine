import { formatMeetingCode } from '@koine/shared'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { buildApp } from '../app'
import { db } from '../db/client'
import { user } from '../db/schema'
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
  // would zero mid-test. Clear only this file's own keys.
  const keys = await redis.keys('rl:lookup:*')
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

it('rejects a join with an unknown language', async () => {
  const { code } = await createMeeting()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'X', speakLang: 'klingon', hearLang: 'en' },
  })
  expect(res.statusCode).toBe(400)
})
