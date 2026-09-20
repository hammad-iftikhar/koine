import { MeResponse } from '@koine/shared'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '@/app'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

it('returns a null user rather than 401 when signed out', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/me' })

  // 401 would make the home screen look broken for a visitor who has simply
  // not signed in yet. Signed out is a state, not an error.
  expect(res.statusCode).toBe(200)
  expect(MeResponse.parse(res.json())).toEqual({ user: null })
})

it('rejects a session cookie that does not exist', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: 'better-auth.session_token=made-up-value' },
  })

  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ user: null })
})
