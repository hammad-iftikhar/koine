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
  // The migration ledger stays in drizzle-kit's default "drizzle" schema. The
  // test harness (apps/api/src/test/db.ts) migrates a whole template database
  // and clones it, so every test database carries its own ledger already.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine' },
})
