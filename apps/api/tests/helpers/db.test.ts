import { withTestDb } from '@tests/helpers/db'
import { expect, it } from 'vitest'
import { session, user } from '@/db/schema'

it('gives each caller an empty, isolated database', async () => {
  const a = await withTestDb()
  const b = await withTestDb()

  try {
    await a.db.insert(user).values({ id: 'u1', name: 'Alice', email: 'alice@example.com' })

    expect(await a.db.select().from(user)).toHaveLength(1)
    // If this is 1, the harness is sharing a database and every later test lies.
    expect(await b.db.select().from(user)).toHaveLength(0)
  } finally {
    await a.destroy()
    await b.destroy()
  }
})

it('enforces the unique email constraint', async () => {
  const t = await withTestDb()
  try {
    await t.db.insert(user).values({ id: 'u1', name: 'A', email: 'same@example.com' })

    await expect(
      t.db.insert(user).values({ id: 'u2', name: 'B', email: 'same@example.com' }),
    ).rejects.toThrow()
  } finally {
    await t.destroy()
  }
})

it('resolves foreign keys inside the isolated database', async () => {
  // The assertion the per-schema harness could not make. Drizzle writes
  // schema-qualified FKs (`REFERENCES "public"."user"`), so a harness that
  // only swapped search_path left session.user_id pointing at a shared
  // `public.user` — an insert here would then fail, or worse, succeed by
  // matching somebody else's row. `user` is the one table with no outgoing
  // FK, so testing it alone proves nothing about isolation.
  const t = await withTestDb()
  try {
    await t.db.insert(user).values({ id: 'u1', name: 'Alice', email: 'alice@example.com' })
    await t.db.insert(session).values({
      id: 's1',
      userId: 'u1',
      token: 'tok',
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(await t.db.select().from(session)).toHaveLength(1)

    // And the constraint is real: a session for a user that does not exist
    // in THIS database is rejected, not silently matched elsewhere.
    await expect(
      t.db.insert(session).values({
        id: 's2',
        userId: 'nobody',
        token: 'tok2',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow()
  } finally {
    await t.destroy()
  }
})
