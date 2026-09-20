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

// Random per process, not a fixed address: join, and now both messages
// routes, are rate-limited per IP (see enforceRateLimit in meetings.ts,
// reused by messages.ts) against real Redis, which persists between
// separate test runs within that window. A fixed address shared by every
// run of this file — or with meetings.test.ts's own bucket-exhaustion test,
// which uses the injection default — would make a run's outcome depend on
// how recently the same address was last used. Every request in this file,
// not just join, carries this address for the same reason.
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

function post(code: string, participantId: string, body: string) {
  return app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/messages`,
    payload: { participantId, body },
    remoteAddress: TEST_REMOTE_ADDRESS,
  })
}

function get(code: string, hear?: string) {
  const query = hear === undefined ? '' : `?hear=${encodeURIComponent(hear)}`
  return app.inject({
    method: 'GET',
    url: `/api/meetings/${code}/messages${query}`,
    remoteAddress: TEST_REMOTE_ADDRESS,
  })
}

it('stores a message and returns it', async () => {
  const { code, participantId } = await room()
  const res = await post(code, participantId, 'Puedo explicarlo en un minuto.')

  expect(res.statusCode).toBe(201)
  expect(res.json().message.body).toBe('Puedo explicarlo en un minuto.')
  expect(res.json().message.author).toBe('Mariam')
})

it('translates once per language, not once per reader', async () => {
  const { code, participantId } = await room()
  await post(code, participantId, 'Hola')

  // Two readers, same language. The second must hit the cached jsonb column.
  await get(code, 'en')
  await get(code, 'en')

  expect(translate).toHaveBeenCalledTimes(1)
})

it('shows the original when translation fails', async () => {
  const { code, participantId } = await room()
  await post(code, participantId, 'Vale, lo vemos mañana.')

  translate.mockRejectedValueOnce(new Error('rate limited'))
  const res = await get(code, 'ur')

  expect(res.statusCode).toBe(200)
  expect(res.json().messages[0].body).toBe('Vale, lo vemos mañana.')
  expect(res.json().messages[0].translations.ur).toBeUndefined()
})

it("does not translate into the author's own language", async () => {
  const { code, participantId } = await room()
  await post(code, participantId, 'Hola')

  await get(code, 'es')
  expect(translate).not.toHaveBeenCalled()
})

it('does not translate into floor, the sentinel for original audio', async () => {
  const { code, participantId } = await room()
  await post(code, participantId, 'Hola')

  const res = await get(code, FLOOR)

  expect(res.statusCode).toBe(200)
  expect(translate).not.toHaveBeenCalled()
  expect(res.json().messages[0].translations[FLOOR]).toBeUndefined()
})

it('ignores an unrecognised hear value instead of treating it as a language', async () => {
  // ?hear=zz1 (or any string outside HearLang's set) must not reach the
  // translator: an unbounded value here means unbounded OpenAI spend and
  // unbounded jsonb growth for anyone holding the meeting code.
  const { code, participantId } = await room()
  await post(code, participantId, 'Hola')

  const res = await get(code, 'zz1')

  expect(res.statusCode).toBe(200)
  expect(translate).not.toHaveBeenCalled()
})

it('returns history in order for a late joiner', async () => {
  const { code, participantId } = await room()
  for (const body of ['one', 'two', 'three']) {
    await post(code, participantId, body)
  }

  const res = await get(code)
  expect(res.json().messages.map((m: { body: string }) => m.body)).toEqual(['one', 'two', 'three'])
})

it('rejects an empty message', async () => {
  const { code, participantId } = await room()
  const res = await post(code, participantId, '   ')
  expect(res.statusCode).toBe(400)
})

it('rejects a message from a participant in another meeting', async () => {
  // Trust boundary: the participant id is client-supplied.
  const a = await room()
  const b = await room()

  const res = await post(a.code, b.participantId, 'not mine to send')
  expect(res.statusCode).toBe(403)
})

it('rejects a message after the meeting has ended', async () => {
  const { code, participantId } = await room()

  const ended = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/end`,
    headers: { 'x-test-user': 'u_host' },
    remoteAddress: TEST_REMOTE_ADDRESS,
  })
  expect(ended.statusCode).toBe(200)

  const res = await post(code, participantId, 'is anyone still there?')
  expect(res.statusCode).toBe(410)
})

it('rejects a message from a participant who has left', async () => {
  const { code, participantId } = await room()

  const left = await app.inject({
    method: 'POST',
    url: `/api/meetings/${code}/leave`,
    payload: { participantId },
    remoteAddress: TEST_REMOTE_ADDRESS,
  })
  expect(left.statusCode).toBe(200)

  const res = await post(code, participantId, 'still here?')
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
  const sent = await post(code, participantId, 'Hola')
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
    await post(code, participantId, body)
  }

  const starts: number[] = []
  const delayMs = 40
  translate.mockImplementation(async (_text: string, _from: string, to: string[]) => {
    starts.push(Date.now())
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return Object.fromEntries(to.map((lang) => [lang, `[${lang}] translated`]))
  })

  // 'ja': a real language code — 'de' was never in @koine/shared's LANGUAGES
  // list, it happened to reach the translator unvalidated before this fix.
  await get(code, 'ja')

  expect(translate).toHaveBeenCalledTimes(3)
  // Wall-clock elapsed can flake under load (a slow CI host inflates every
  // call, concurrent or not). Assert overlap directly instead: run one at a
  // time, each call's start would trail the previous one by ~delayMs, so the
  // spread between the earliest and latest start would be close to
  // 2 x delayMs for three calls. Run concurrently, all three start within
  // one delay window of each other.
  expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(delayMs)

  translate.mockImplementation(defaultTranslateImpl)
})
