# Koine

Real-time translated video meetings. A pnpm monorepo: `apps/web`, `apps/api`,
`apps/agent` and `packages/shared`.

## Getting started

Prerequisites: Node 22+, pnpm 11 (via corepack), Docker Desktop.

```sh
pnpm install
cp .env.example .env          # dev placeholders; real keys are optional
docker compose up -d          # postgres, redis, livekit
pnpm --filter @koine/api db:migrate   # apps/api's route tests hit this database directly
```

That is enough to work on the apps from the host. To run everything in
containers instead:

```sh
docker compose --profile apps up
```

Web is on http://localhost:5173, the API on http://localhost:3000. The app
containers use the node_modules baked into their image, so rebuild with
`docker compose --profile apps up --build --renew-anon-volumes` after changing
a dependency.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm check` | Biome lint and format |
| `pnpm types` | `tsc --noEmit` across every package |
| `pnpm test` | Unit and component tests |
| `pnpm --filter @koine/web storybook` | Storybook on port 6006 |
| `pnpm --filter @koine/web e2e` | Playwright end-to-end tests |

## Layout and conventions

```
apps/api/src/modules/<feature>/<feature>.{route,controller,repository}.ts
apps/api/tests/modules/<feature>/<feature>.route.test.ts
```

- **Imports.** `apps/web` only: `@/` is its `src/`, `@tests/` its `tests/`, and
  anything leaving its directory uses the alias. `apps/api`, `apps/agent` and
  `packages/shared` use relative imports throughout. See
  [decision 0017](docs/decisions/0017-path-alias-in-the-web-app-only.md).
- **Tests.** One `tests/` folder per package, mirroring `src/`. Storybook
  stories stay beside their components. See [decision 0002](docs/decisions/0002-tests-in-a-per-package-tests-folder.md).
- **API modules.** Routes register URLs, controllers hold the rules, repositories
  hold the SQL. See [decision 0003](docs/decisions/0003-route-controller-repository-modules.md).

## Decisions

Anything non-obvious about how this works is written down in
[`docs/decisions/`](docs/decisions/README.md) — why the LiveKit room is not the
meeting code, why the rate limiter fails open, why test databases are template
clones. Read it before "fixing" something that looks wrong.
