import { expect, it } from 'vitest'
import { user } from '../db/schema'
import { withTestDb } from './db'

it('gives each caller an empty, isolated schema', async () => {
  const a = await withTestDb()
  const b = await withTestDb()

  await a.db.insert(user).values({ id: 'u1', name: 'Alice', email: 'alice@example.com' })

  expect(await a.db.select().from(user)).toHaveLength(1)
  // If this is 1, the harness is sharing a schema and every later test lies.
  expect(await b.db.select().from(user)).toHaveLength(0)

  await a.destroy()
  await b.destroy()
})

it('enforces the unique email constraint', async () => {
  const t = await withTestDb()
  await t.db.insert(user).values({ id: 'u1', name: 'A', email: 'same@example.com' })

  await expect(
    t.db.insert(user).values({ id: 'u2', name: 'B', email: 'same@example.com' }),
  ).rejects.toThrow()

  await t.destroy()
})
