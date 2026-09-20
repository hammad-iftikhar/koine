import { withTestDb } from '@tests/helpers/db'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { buildApp } from '@/app'
import { createAuth } from '@/auth'

let app: Awaited<ReturnType<typeof buildApp>>
let testDb: Awaited<ReturnType<typeof withTestDb>>

beforeAll(async () => {
  // An isolated database, not the shared DATABASE_URL one: this suite writes
  // OAuth state to the `verification` table on every sign-in attempt, and a
  // never-migrated database (as CI's `koine` service is) would 500 here.
  testDb = await withTestDb()
  app = await buildApp(createAuth(testDb.db))
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await testDb?.destroy()
})

const ALLOWED_ORIGIN = 'http://localhost:5173'

function signInWithGoogle(callbackURL: string, origin = ALLOWED_ORIGIN) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/social',
    headers: { origin, 'content-type': 'application/json' },
    payload: { provider: 'google', callbackURL },
  })
}

// What these two tests do and do not prove: with no real Google credentials
// the OAuth round trip cannot complete here, so they assert on the
// callbackURL trust boundary only — that an origin on the WEB_ORIGIN list is
// accepted and one off it is not. Whether Google then signs anybody in is not
// in scope and cannot be tested without live credentials.
it('accepts a callbackURL on an allowed web origin', async () => {
  // The SPA and the API are on different origins, so Better Auth's default
  // trustedOrigins (the API's own origin) rejected every callbackURL the SPA
  // could produce. If this comes back INVALID_CALLBACK_URL, sign-in is broken
  // for every user, not just for this test.
  const res = await signInWithGoogle(`${ALLOWED_ORIGIN}/meeting/kxvnvradwq`)

  expect(res.json()).not.toMatchObject({ code: 'INVALID_CALLBACK_URL' })
  expect(res.statusCode).toBe(200)
  // The shape signInWithGoogle() in apps/web/src/lib/auth.ts redirects with.
  expect(res.json()).toMatchObject({ redirect: true, url: expect.stringContaining('https://') })
})

it('rejects a callbackURL on an origin that is not allowed', async () => {
  // The negative control. Without it the test above would still pass if the
  // check were disabled altogether rather than configured correctly.
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const res = await signInWithGoogle('https://evil.example/steal')

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ code: 'INVALID_CALLBACK_URL' })
  } finally {
    quiet.mockRestore()
  }
})

it('clears the session cookie as HttpOnly and SameSite=Lax on sign-out', () => {
  // The spec asks for HTTP-only, SameSite=Lax session cookies. They come from
  // Better Auth's defaults rather than from our config, which makes them
  // exactly the kind of thing that silently regresses. Sign-out is the one
  // response that emits the session cookie without a live OAuth round trip.
  return app
    .inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { origin: ALLOWED_ORIGIN, 'content-type': 'application/json' },
      payload: {},
    })
    .then((res) => {
      const cookies = res.headers['set-cookie']
      const header = (Array.isArray(cookies) ? cookies : [cookies]).find((value) =>
        value?.startsWith('better-auth.session_token='),
      )

      expect(header).toBeDefined()
      expect(header).toMatch(/;\s*HttpOnly/i)
      expect(header).toMatch(/;\s*SameSite=Lax/i)
      expect(header).toMatch(/;\s*Path=\//i)
    })
})
