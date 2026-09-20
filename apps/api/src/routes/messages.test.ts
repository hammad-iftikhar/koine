import { FLOOR } from '@koine/shared'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { setTranslator } from '../translate'

let app: Awaited<ReturnType<typeof buildApp>>
const translate = vi.fn(async (_text: string, _from: string, to: string[]) =>
  Object.fromEntries(to.map((lang) => [lang, `[${lang}] translated`])),
)

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
    // A distinct fake remote address, not the injection default of
    // 127.0.0.1: join is rate-limited per IP (see enforceRateLimit in
    // meetings.ts), and meetings.test.ts drives that same bucket right up
    // to its limit from the default address. Sharing it would make either
    // file's outcome depend on how vitest happens to interleave the two.
    remoteAddress: '10.0.0.7',
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
