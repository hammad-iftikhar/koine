import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../../../src/app'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

it('reports healthy', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ status: 'ok' })
})

it('returns a structured 404 for an unknown route', async () => {
  const res = await app.inject({ method: 'GET', url: '/nope' })
  expect(res.statusCode).toBe(404)
  expect(res.json()).toMatchObject({
    statusCode: 404,
    error: expect.any(String),
    message: expect.any(String),
  })
})
