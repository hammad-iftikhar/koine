import Redis from 'ioredis'
import { afterAll, expect, it } from 'vitest'
import { consume } from '@/rate-limit'
import { redis } from '@/redis'

const key = () => `test:${Math.random().toString(36).slice(2)}`

afterAll(async () => {
  await redis.quit()
})

it('allows up to the limit and then blocks', async () => {
  const k = key()
  for (let i = 0; i < 10; i++) {
    expect((await consume(k, 10, 60)).allowed, `attempt ${i + 1}`).toBe(true)
  }
  expect((await consume(k, 10, 60)).allowed).toBe(false)
})

it('counts across processes, not per process', async () => {
  // The whole reason this is in Redis. A second client stands in for a second
  // API instance: it reads the same counter `consume` incremented through the
  // first client, proving the count lives in Redis rather than in either
  // process's memory.
  const k = key()
  const second = new Redis(process.env.REDIS_URL as string)

  for (let i = 0; i < 6; i++) await consume(k, 10, 60)
  for (let i = 0; i < 4; i++) await consume(k, 10, 60)

  expect(await second.get(`rl:${k}`)).toBe('10')
  expect((await consume(k, 10, 60)).allowed).toBe(false)
  await second.quit()
})

it('expires the window', async () => {
  const k = key()
  await consume(k, 1, 1)
  expect((await consume(k, 1, 1)).allowed).toBe(false)
  await new Promise((r) => setTimeout(r, 1100))
  expect((await consume(k, 1, 1)).allowed).toBe(true)
})

it('rejects rather than returning a NaN remaining count when the INCR errors', async () => {
  // Plant a non-string value at the key so INCR fails with WRONGTYPE inside
  // the transaction. Without the error check, `consume` would resolve with
  // `{ allowed: false, remaining: NaN }` instead of surfacing the fault.
  const k = key()
  await redis.lpush(`rl:${k}`, 'x')

  await expect(consume(k, 10, 60)).rejects.toThrow()
})
