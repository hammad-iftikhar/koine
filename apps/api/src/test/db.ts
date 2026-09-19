import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

const BASE = process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine'

/**
 * A fresh, isolated schema per test file. Real Postgres, real SQL, real
 * constraints — mocking Drizzle would test the mock.
 *
 * ponytail: a `search_path` schema, not a separate database. Creating a database
 * per file takes seconds; creating a schema takes milliseconds.
 */
export async function withTestDb() {
  const name = `t_${randomBytes(6).toString('hex')}`
  // onnotice: () => {} — DROP SCHEMA ... CASCADE logs an expected NOTICE for
  // every object it takes down; without this it drowns out real test output.
  const admin = postgres(BASE, { max: 1, onnotice: () => {} })
  await admin.unsafe(`CREATE SCHEMA "${name}"`)
  await admin.end()

  const url = `${BASE}?options=-c%20search_path%3D${name}`
  execSync('pnpm drizzle-kit migrate --config ../../drizzle.config.ts', {
    cwd: new URL('../..', import.meta.url).pathname,
    // DRIZZLE_MIGRATIONS_SCHEMA keeps this schema's migration ledger inside
    // itself — see the comment in drizzle.config.ts for why that's required.
    env: { ...process.env, DATABASE_URL: url, DRIZZLE_MIGRATIONS_SCHEMA: name },
    stdio: 'pipe',
  })

  const sql = postgres(url, { max: 4 })
  const db = drizzle(sql, { schema })

  return {
    db,
    sql,
    async destroy() {
      await sql.end()
      const cleanup = postgres(BASE, { max: 1, onnotice: () => {} })
      await cleanup.unsafe(`DROP SCHEMA "${name}" CASCADE`)
      await cleanup.end()
    },
  }
}
