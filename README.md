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
