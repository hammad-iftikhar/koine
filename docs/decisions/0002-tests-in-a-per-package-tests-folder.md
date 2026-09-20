# 0002. Put tests in a per-package `tests/` folder mirroring `src/`

**Status:** Accepted
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** `apps/*/tests`, `packages/*/tests`, the `include` globs in each vitest config

## Context

Tests were colocated: `src/auth.ts` next to `src/auth.test.ts`. That reads well
but leaves test code inside the shipped source tree, and the directory listing
of `src/` was half implementation and half tests.

## Decision

One `tests/` folder per package, its directory structure mirroring `src/`.
`src/modules/meeting/meeting.route.ts` is tested by
`tests/modules/meeting/meeting.route.test.ts`. Test-only helpers live in
`tests/helpers/`, reachable as `@tests/helpers/...`.

Storybook `*.stories.tsx` files stay next to their components. They are
component documentation that happens to be executable, not tests, and
`.storybook/main.ts` globs them out of `src/`.

Playwright's specs moved with everything else, to `tests/e2e/`.

## Consequences

- Each vitest config includes `tests/**/*.test.ts`, not `src/**/*.test.ts`. A
  test file left in `src/` is now silently never run.
- Moving a source file means moving its test too, or the mirror drifts. Nothing
  enforces the mirror.
- `apps/api/tests/helpers/db.ts` shells out to `drizzle-kit` with a `cwd`
  computed from `import.meta.url`. It survived the move only because
  `tests/helpers/` is the same depth as the old `src/test/`.
