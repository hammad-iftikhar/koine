import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

const BASE = process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine'

/** Migrated once per machine, then cloned per caller. */
const TEMPLATE = process.env.TEST_TEMPLATE_DB ?? 'koine_test_template'

// Created as the last step of building the template, so a half-migrated
// leftover from a crashed run is never mistaken for a usable template.
const READY_MARKER = '__template_ready'

// Arbitrary but fixed. Every process that might build the template takes this
// advisory lock on the maintenance database first, so exactly one of them
// migrates while the rest wait and then find it ready.
const SETUP_LOCK = 4820113001

function urlFor(database: string): string {
  const url = new URL(BASE)
  url.pathname = `/${database}`
  return url.toString()
}

// onnotice: () => {} — CREATE/DROP DATABASE and the migration log expected
// NOTICEs; without this they drown out real test output.
function connect(url: string, max = 1) {
  return postgres(url, { max, onnotice: () => {} })
}

function migrate(databaseUrl: string): void {
  try {
    execSync('pnpm drizzle-kit migrate --config ../../drizzle.config.ts', {
      cwd: new URL('../..', import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    })
  } catch (error) {
    // stdio: 'pipe' swallows drizzle-kit's output, so without this a failure
    // surfaces only as an opaque `Command failed`.
    const failure = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
    throw new Error(
      [
        `drizzle-kit migrate failed while building the "${TEMPLATE}" database.`,
        failure.message ?? String(error),
        `--- stdout ---\n${failure.stdout?.toString() ?? ''}`,
        `--- stderr ---\n${failure.stderr?.toString() ?? ''}`,
      ].join('\n'),
      { cause: error },
    )
  }
}

async function templateIsReady(admin: postgres.Sql): Promise<boolean> {
  const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEMPLATE}`
  if (rows.length === 0) return false

  // Connect and check for the marker, then disconnect: CREATE DATABASE ...
  // TEMPLATE fails while any other session is attached to the template.
  const probe = connect(urlFor(TEMPLATE))
  try {
    const [marker] = await probe`SELECT to_regclass(${`public.${READY_MARKER}`}) AS oid`
    return marker?.oid != null
  } finally {
    await probe.end()
  }
}

async function dropDatabase(admin: postgres.Sql, name: string): Promise<void> {
  // WITH (FORCE) terminates stragglers instead of failing the drop (PG 13+).
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
}

let ensured: Promise<void> | undefined

/**
 * Creates and migrates the template database if it is not already there.
 * Idempotent across runs and safe to call concurrently from several processes.
 */
export function ensureTemplateDatabase(): Promise<void> {
  ensured ??= buildTemplateDatabase()
  return ensured
}

async function buildTemplateDatabase(): Promise<void> {
  const admin = connect(BASE)
  try {
    await admin`SELECT pg_advisory_lock(${SETUP_LOCK})`
    if (await templateIsReady(admin)) return

    await dropDatabase(admin, TEMPLATE)
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE}"`)
    try {
      migrate(urlFor(TEMPLATE))
      const template = connect(urlFor(TEMPLATE))
      try {
        await template.unsafe(`CREATE TABLE "${READY_MARKER}" ()`)
      } finally {
        await template.end()
      }
    } catch (error) {
      // Leave nothing half-built behind for the next run to trust.
      await dropDatabase(admin, TEMPLATE)
      throw error
    }
  } finally {
    // Ending the connection releases the advisory lock.
    await admin.end()
  }
}

async function cloneTemplate(admin: postgres.Sql, name: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE}"`)
      return
    } catch (error) {
      // 55006 object_in_use: another session is attached to the template right
      // now. That clears on its own, so back off rather than failing the run.
      if (attempt >= 20 || (error as { code?: string }).code !== '55006') throw error
      await new Promise((resolve) => setTimeout(resolve, 25 + attempt * 25))
    }
  }
}

/**
 * A fresh, isolated database per test file. Real Postgres, real SQL, real
 * constraints — mocking Drizzle would test the mock.
 *
 * A cloned database, not a `search_path` schema: Drizzle emits
 * schema-qualified foreign keys (`REFERENCES "public"."user"`), so in a
 * per-schema harness every FK still pointed at a shared `public` and the
 * isolation was a lie. Postgres clones a template by file copy, which at this
 * size costs about as much as creating a schema did — and the migration runs
 * once per machine instead of once per caller.
 */
export async function withTestDb() {
  await ensureTemplateDatabase()

  const name = `t_${randomBytes(6).toString('hex')}`
  const admin = connect(BASE)
  try {
    await cloneTemplate(admin, name)
  } finally {
    await admin.end()
  }

  const sql = connect(urlFor(name), 4)
  const db = drizzle(sql, { schema })

  return {
    db,
    sql,
    async destroy() {
      await sql.end()
      const cleanup = connect(BASE)
      try {
        await dropDatabase(cleanup, name)
      } finally {
        await cleanup.end()
      }
    },
  }
}
