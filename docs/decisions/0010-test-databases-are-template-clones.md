# 0010. Test databases are clones of a migrated template

**Status:** Accepted
**Decided:** module 03 (auth & identity) · **Recorded:** 2026-09-20
**Lives in:** `apps/api/tests/helpers/db.ts`

## Context

The API's tests run against real Postgres — real SQL, real constraints; mocking
Drizzle would test the mock. That needs isolation per test file, and the first
attempt gave each file its own schema on a shared `search_path`.

That isolation was a lie. Drizzle emits schema-qualified foreign keys
(`REFERENCES "public"."user"`), so every FK in every per-file schema still
pointed at one shared `public`.

## Decision

One template database per machine, migrated once, then cloned with
`CREATE DATABASE ... TEMPLATE` per test file. Postgres clones by file copy,
which at this size costs about what creating a schema did.

The build is guarded by a fixed advisory lock on the maintenance database, so
concurrent processes produce one migration and the rest wait. A
`__template_ready` marker table is created as the *last* step, so a
half-migrated leftover from a crashed run is never mistaken for a usable
template. `pnpm --filter @koine/api test:setup` builds it ahead of time in CI so
a migration failure reports as a migration failure.

## Consequences

- Real isolation: each file gets its own database, dropped `WITH (FORCE)` after.
- **The template is not rebuilt when a new migration lands.** It is only built
  if missing, so the first test run after a schema change still sees the old
  schema. Drop `koine_test_template` by hand after adding a migration.
- `apps/api/tests/modules/meeting/meeting.route.test.ts` deliberately uses the
  shared `DATABASE_URL` database instead of a clone, which is why CI runs
  `db:migrate` against it as its own step.
