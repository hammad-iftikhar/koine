import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

// CORS is the trust boundary that makes cross-origin, credentialed requests
// possible at all. An allow-list bug here (e.g. `origin: true` or a
// reflect-any-origin function) combined with `credentials: true` is a CSRF
// hole, so it gets tests regardless of what the client does.
const ALLOWED_ORIGIN = 'http://localhost:5173'
const DISALLOWED_ORIGIN = 'https://evil.example'

describe('CORS allow-list', () => {
  it('echoes an allowed origin and allows credentials on a simple request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED_ORIGIN },
    })

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  // @fastify/cors (like the reference `cors` npm package) always sends
  // Access-Control-Allow-Credentials once `credentials: true` is configured,
  // regardless of whether the request's origin matched the allow-list —
  // only Access-Control-Allow-Origin is gated by it. That's fine: per the
  // Fetch spec a browser only exposes a credentialed cross-origin response
  // to script when Access-Control-Allow-Origin echoes the exact request
  // origin (never `*`), so Allow-Credentials alone is inert without it.
  // Allow-Origin is therefore the header this test asserts on.
  it('omits access-control-allow-origin for a disallowed origin on a simple request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: DISALLOWED_ORIGIN },
    })

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('echoes an allowed origin and allows credentials on a preflight request', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/me',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('omits access-control-allow-origin for a disallowed origin on a preflight request', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/me',
      headers: {
        origin: DISALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
