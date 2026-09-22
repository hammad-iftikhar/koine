import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { createAuth } from '../src/auth'
import { withTestDb } from './helpers/db'

// Its own file on purpose: Better Auth's default rate-limit storage is an
// in-memory map, and vitest gives each test file its own process, so these
// requests get a bucket that no other test has already spent.

let app: Awaited<ReturnType<typeof buildApp>>
let testDb: Awaited<ReturnType<typeof withTestDb>>

beforeAll(async () => {
  // An isolated database: this test drives 11 sign-in attempts against the
  // real /api/auth/* handler, each writing OAuth state to `verification`.
  // Against the shared DATABASE_URL database that both 500s on a
  // never-migrated (CI) database and leaves rows behind on every run.
  testDb = await withTestDb()
  app = await buildApp(createAuth(testDb.db))
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await testDb?.destroy()
})

// Matches the customRules entry in auth.ts.
const SIGN_IN_CEILING = 10

it('rate-limits sign-in attempts and cannot be escaped by spoofing an IP', async () => {
  const statuses: number[] = []
  for (let attempt = 0; attempt <= SIGN_IN_CEILING; attempt++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        // A different claimed IP every time. The proxy in app.ts overwrites
        // this header with the real peer address, so all of these land in one
        // bucket. If they did not, rate limiting would be free to bypass.
        'x-forwarded-for': `203.0.113.${attempt}`,
      },
      payload: { provider: 'google', callbackURL: 'http://localhost:5173/' },
    })
    statuses.push(res.statusCode)
  }

  expect(statuses.slice(0, SIGN_IN_CEILING)).toEqual(Array(SIGN_IN_CEILING).fill(200))
  expect(statuses[SIGN_IN_CEILING]).toBe(429)
})
