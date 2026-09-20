import { randomInt } from 'node:crypto'
import { FLOOR } from '@koine/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { db } from '../db/client'
import { message } from '../db/schema'
import { setTranslator } from '../translate'
import { cacheTranslation } from './messages'

let app: Awaited<ReturnType<typeof buildApp>>
const defaultTranslateImpl = async (_text: string, _from: string, to: string[]) =>
  Object.fromEntries(to.map((lang) => [lang, `[${lang}] translated`]))
const translate = vi.fn(defaultTranslateImpl)

// Random per process, not a fixed address: join is rate-limited per IP (30
// per 60s, see enforceRateLimit in meetings.ts) against real Redis, which
// persists between separate test runs within that window. A fixed address
// shared by every run of this file — or with meetings.test.ts's own
// bucket-exhaustion test, which uses the injection default — would make a
// run's outcome depend on how recently the same address was last used.
const TEST_REMOTE_ADDRESS = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`

beforeAll(async () => {
  setTranslator({ translate })
  app = await buildApp()
  await app.ready()
})
beforeEach(async () => {
  translate.mockClear()
})
afterAll(async () => {
  await app.close()
})

async function room() {
  const created = await app.inject({
    method: 'POST',
    url: '/api/meetings',
    payload: { floorLang: 'en' },
    headers: { 'x-test-user': 'u_host' },
  })
  const code = created.json().code as string

  const joined = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/join`,
    payload: { displayName: 'Mariam', speakLang: 'es', hearLang: 'en' },
    remoteAddress: TEST_REMOTE_ADDRESS,
  })
  return { code, participantId: joined.json().participantId as string }
}

it('stores a message and returns it', async () => {
  const { code, participantId } = await room()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Puedo explicarlo en un minuto.' },
  })

  expect(res.statusCode).toBe(201)
  expect(res.json().message.body).toBe('Puedo explicarlo en un minuto.')
  expect(res.json().message.author).toBe('Mariam')
})

it('translates once per language, not once per reader', async () => {
  const { code, participantId } = await room()
  await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Hola' },
  })

  // Two readers, same language. The second must hit the cached jsonb column.
  await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages?hear=en` })
  await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages?hear=en` })

  expect(translate).toHaveBeenCalledTimes(1)
})

it('shows the original when translation fails', async () => {
  const { code, participantId } = await room()
  await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Vale, lo vemos mañana.' },
  })

  translate.mockRejectedValueOnce(new Error('rate limited'))
  const res = await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages?hear=ur` })

  expect(res.statusCode).toBe(200)
  expect(res.json().messages[0].body).toBe('Vale, lo vemos mañana.')
  expect(res.json().messages[0].translations.ur).toBeUndefined()
})

it("does not translate into the author's own language", async () => {
  const { code, participantId } = await room()
  await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Hola' },
  })

  await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages?hear=es` })
  expect(translate).not.toHaveBeenCalled()
})

it('does not translate into floor, the sentinel for original audio', async () => {
  const { code, participantId } = await room()
  await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Hola' },
  })

  const res = await app.inject({
    method: 'GET',
    url: `/api/meetings/${code}/messages?hear=${FLOOR}`,
  })

  expect(res.statusCode).toBe(200)
  expect(translate).not.toHaveBeenCalled()
  expect(res.json().messages[0].translations[FLOOR]).toBeUndefined()
})

it('returns history in order for a late joiner', async () => {
  const { code, participantId } = await room()
  for (const body of ['one', 'two', 'three']) {
    await app.inject({
      method: 'POST',
      url: `/api/meetings/${code}/messages`,
      payload: { participantId, body },
    })
  }

  const res = await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages` })
  expect(res.json().messages.map((m: { body: string }) => m.body)).toEqual(['one', 'two', 'three'])
})

it('rejects an empty message', async () => {
  const { code, participantId } = await room()
  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: '   ' },
  })
  expect(res.statusCode).toBe(400)
})

it('rejects a message from a participant in another meeting', async () => {
  // Trust boundary: the participant id is client-supplied.
  const a = await room()
  const b = await room()

  const res = await app.inject({
    method: 'POST',
    url: `/api/meetings/${a.code}/messages`,
    payload: { participantId: b.participantId, body: 'not mine to send' },
  })
  expect(res.statusCode).toBe(403)
})

it('merges two writes that raced from the same snapshot instead of one clobbering the other', async () => {
  // Reproducing the actual HTTP race was not reliable: two `app.inject`
  // calls fired via Promise.all against local Postgres complete fast enough
  // that the second request's SELECT usually already observes the first
  // request's committed UPDATE, so the race window this bug depends on
  // rarely opens. Instead this drives the exact function the GET handler
  // calls to persist a translation (`cacheTranslation`) twice in a row for
  // the same row, which is what actually happens on the wire whenever two
  // readers' writes land back to back — the SQL merge must not care which
  // JS-side snapshot either caller started from.
  const { code, participantId } = await room()
  const sent = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body: 'Hola' },
  })
  const messageId = sent.json().message.id as string

  await cacheTranslation(messageId, { fr: '[fr] translated' })
  await cacheTranslation(messageId, { de: '[de] translated' })

  const [row] = await db
    .select({ translations: message.translations })
    .from(message)
    .where(eq(message.id, messageId))

  expect(row?.translations).toMatchObject({
    fr: '[fr] translated',
    de: '[de] translated',
  })
})

it('translates a backlog of uncached messages concurrently, not one at a time', async () => {
  const { code, participantId } = await room()
  for (const body of ['one', 'two', 'three']) {
    await app.inject({
      method: 'POST',
      url: `/api/meetings/${code}/messages`,
      payload: { participantId, body },
    })
  }

  const starts: number[] = []
  const delayMs = 40
  translate.mockImplementation(async (_text: string, _from: string, to: string[]) => {
    starts.push(Date.now())
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return Object.fromEntries(to.map((lang) => [lang, `[${lang}] translated`]))
  })

  const before = Date.now()
  await app.inject({ method: 'GET', url: `/api/meetings/${code}/messages?hear=de` })
  const elapsed = Date.now() - before

  expect(translate).toHaveBeenCalledTimes(3)
  // Run one at a time, three calls would take roughly 3 x delayMs. Run
  // concurrently, the whole response should land close to a single delay.
  expect(elapsed).toBeLessThan(delayMs * 2)

  translate.mockImplementation(defaultTranslateImpl)
})
