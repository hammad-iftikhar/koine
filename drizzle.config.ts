import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit joins `schema`/`out` onto process.cwd() internally (it never
// resolves them against this file's own location). Both `pnpm --filter
// @koine/api db:generate` and the test harness's execSync (apps/api/src/test/db.ts)
// invoke drizzle-kit with cwd=apps/api, so a path written relative to the repo
// root would resolve to the wrong place from there. Computing the path relative
// to process.cwd() at load time makes it resolve correctly from either cwd.
const root = path.dirname(fileURLToPath(import.meta.url))
const relativeToCwd = (target: string) => path.relative(process.cwd(), path.join(root, target))

export default defineConfig({
  schema: relativeToCwd('apps/api/src/db/schema.ts'),
  out: relativeToCwd('apps/api/drizzle'),
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine' },
  // drizzle-kit's migration ledger lives in a fixed "drizzle" schema by
  // default, unaffected by DATABASE_URL's search_path — so a schema-scoped
  // test DB would be seen as "already migrated" the moment any other schema
  // in the same database has run migration 0000, and its tables would never
  // get created. The test harness (apps/api/src/test/db.ts) points the ledger
  // at the test's own schema so each isolated schema tracks its own history.
  ...(process.env.DRIZZLE_MIGRATIONS_SCHEMA
    ? { migrations: { schema: process.env.DRIZZLE_MIGRATIONS_SCHEMA } }
    : {}),
})
