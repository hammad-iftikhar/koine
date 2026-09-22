# 0017. Keep the `@/` alias in the web app only

**Status:** Accepted, supersedes [0001](0001-path-alias-for-cross-directory-imports.md)
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** `apps/web/vite.config.ts`, `apps/web/tsconfig.json`

## Context

[0001](0001-path-alias-for-cross-directory-imports.md) put `@/` in all four
packages. In practice the payoff was not evenly spread. `apps/web` has 43 aliased
imports across a three-deep tree of components, containers, routes and lib, and
its stories had been reaching `../../.storybook/`. `apps/agent` and
`packages/shared` are flat `src/` directories that produced **zero** aliased
imports — the alias was declared for them and never used.

`apps/api` had 22, all of them one level (`../auth`, `../db/client`), and it also
carried the cost 0001 did not anticipate: the alias is declared outside `src`,
while the dev containers mount only `src`. That put a second copy of the
resolution rules in `docker-compose.yml`, and got the API container a
`Cannot find package '@/modules'` at startup — an error naming neither the
tsconfig nor the mount that caused it.

## Decision

`apps/web` keeps `@/` and `@tests/`. `apps/api`, `apps/agent` and
`packages/shared` go back to relative imports, and their `paths` entries and
vitest `resolve.alias` blocks are removed rather than left declared and unused.

The rest of [0001](0001-path-alias-for-cross-directory-imports.md) still holds
for web: same-directory imports stay relative, and the alias must be declared in
the tsconfig *and* the vite config *and* each vitest project, because none of
those inherits from another.

## Consequences

- One package's build config knows about `@/`, not four. `docker-compose.yml`
  mounts one extra file (`apps/web/vite.config.ts`) instead of six.
- The backend's test files, which live in `tests/` mirroring `src/`
  ([0002](0002-tests-in-a-per-package-tests-folder.md)), now reach their subject
  through `../../../src/...`. That depth is the price of this decision and is
  worst in `apps/api/tests/modules/<feature>/`.
- Two conventions in one repo. A file moved between `apps/web` and `apps/api`
  needs its imports rewritten in one direction or the other.
