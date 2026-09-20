# 0001. Use `@/` for cross-directory imports

**Status:** Accepted
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** each package's `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

## Context

Imports that reached out of their own directory were written as `../lib/cn`,
`../../.storybook/fakeStream` and so on — 67 of them across four packages. Every
one of those paths is a fact about where the importing file happens to sit, so
moving a file meant editing lines that had nothing to do with the move. The
`../../` cases had already stopped being readable.

## Decision

`@/` maps to the package's own `src/`, `@tests/` to its own `tests/`. Every
import that leaves its directory uses the alias. Same-directory imports stay
relative (`./sibling`) — they never break on a move, and rewriting them would
have doubled the diff to say nothing new.

The alias is declared in four places per package because four tools resolve
modules independently: `tsconfig.json` `paths` (typecheck, and `tsx` at
runtime, which reads it), the vite config (build and storybook), the vitest
config, and — separately — each vitest *project*, which does not inherit the
root config's `resolve.alias`.

## Consequences

- A file moves without its importers changing.
- The alias must be added in all of those places at once, or a package
  typechecks and then fails to resolve at run time (or vice versa). The web
  package's `unit` vitest project is the easy one to miss.
- `@/` is a module specifier only. Code that reads files off disk — the token
  linter in `apps/web/tests/styles/tokens.test.ts` — still needs a real path.
