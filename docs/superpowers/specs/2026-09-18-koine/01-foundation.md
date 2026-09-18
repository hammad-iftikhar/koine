# 01 — Foundation

Repository shape, tooling and the test strategy everything else is built on.

## Monorepo

pnpm workspaces. Four packages:

```
apps/web        Vite + React 19 + TS       the SPA
apps/api        Fastify + TS               REST, auth, token minting
apps/agent      LiveKit Agents worker      translation pipeline
packages/shared Zod schemas + types        imported by all three
```

`packages/shared` holds request/response schemas, the language list, and the
meeting-code format. It has no runtime dependencies beyond Zod.

## Development environment

Every service runs in Docker. One `docker-compose.yml` at the repo root, two modes
through a Compose profile:

```
docker compose up -d                 postgres, redis, livekit
docker compose --profile apps up     the above plus api, agent, web
```

Infrastructure has no profile so it always starts; the Node services sit behind
`apps`. One file, two modes, nothing to keep in sync.

Postgres and Redis have health checks, and the app services wait on
`service_healthy` rather than racing the database on boot. The three Node services
share one dev Dockerfile and differ only by command.

**This configuration was built and verified before being written down**: all three
infrastructure services came up healthy, LiveKit connected to Redis on its own,
and the signalling endpoint answered on 7880. The files below are the verified
ones, not a sketch.

### LiveKit in Docker — the part that wastes a day

Two settings in the LiveKit config are not defaults and are not optional.

**`rtc.node_ip: "127.0.0.1"`.** LiveKit advertises an IP address for clients to
send media to. By default that is the container's internal address, which the
browser cannot reach. The failure mode is the worst kind: the room connects, the
participant list populates, no video ever arrives, and nothing logs an error.
Browser and Docker are on the same machine, so it advertises loopback. Testing
from a phone or a second laptop means changing that one line to the host's LAN
address.

**`rtc.udp_port: 7882`.** A single UDP mux port instead of the default
50000–60000 range. A wide range works with host networking on Linux; macOS and
Windows Docker have no host networking, and mapping ten thousand ports is not a
plan.

Redis is wired into LiveKit in development exactly as in production, so the
multi-node coordination path is exercised locally rather than first meeting
reality on deploy.

### Secrets

`.env.example` is committed; `.env` is not. Copy it, and Compose reads it
automatically. Google and OpenAI credentials are blank by default — sign-in and
translation are unavailable without them, and everything else runs regardless. A
new contributor reaches a running stack before obtaining any third-party account.

### `docker-compose.yml`

```yaml
name: koine

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: koine
      POSTGRES_PASSWORD: koine
      POSTGRES_DB: koine
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U koine -d koine"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    # No persistence in dev: Redis holds counters and coordination, never truth.
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  livekit:
    image: livekit/livekit-server:v1.8
    command: ["--config", "/etc/livekit.yaml"]
    volumes: ["./docker/livekit.dev.yaml:/etc/livekit.yaml:ro"]
    ports:
      - "7880:7880"        # signalling (HTTP/WS)
      - "7881:7881"        # WebRTC over TCP, fallback
      - "7882:7882/udp"    # single-port UDP mux
    depends_on:
      redis: { condition: service_healthy }

  api:
    profiles: ["apps"]
    build: { context: ., dockerfile: docker/Dockerfile.dev }
    command: ["pnpm", "--filter", "@koine/api", "dev"]
    environment:
      DATABASE_URL: postgres://koine:koine@postgres:5432/koine
      REDIS_URL: redis://redis:6379
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      GUEST_TOKEN_SECRET: ${GUEST_TOKEN_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports: ["3000:3000"]
    volumes: &src
      - ./:/app
      - /app/node_modules
      - /app/apps/api/node_modules
      - /app/apps/agent/node_modules
      - /app/apps/web/node_modules
      - /app/packages/shared/node_modules
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  agent:
    profiles: ["apps"]
    build: { context: ., dockerfile: docker/Dockerfile.dev }
    command: ["pnpm", "--filter", "@koine/agent", "dev"]
    environment:
      DATABASE_URL: postgres://koine:koine@postgres:5432/koine
      REDIS_URL: redis://redis:6379
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    volumes: *src
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  web:
    profiles: ["apps"]
    build: { context: ., dockerfile: docker/Dockerfile.dev }
    command: ["pnpm", "--filter", "@koine/web", "dev", "--host", "0.0.0.0"]
    environment:
      VITE_API_URL: http://localhost:3000
      # The browser reaches LiveKit from the host, not the compose network.
      VITE_LIVEKIT_URL: ws://localhost:7880
    ports: ["5173:5173"]
    volumes: *src

volumes:
  pgdata:
```

### `docker/livekit.dev.yaml`

```yaml
# Development only. Production config is separate; see module 08.
port: 7880
bind_addresses: ["0.0.0.0"]
log_level: info

rtc:
  tcp_port: 7881
  udp_port: 7882          # single mux port; see the note above
  node_ip: "127.0.0.1"    # change to the host LAN IP to test from another device
  use_external_ip: false

redis:
  address: redis:6379

# Dev credentials. Production keys are generated per environment and never
# committed. LiveKit requires a secret of at least 32 characters.
keys:
  devkey: devsecret_change_me_at_least_32_chars

# No TURN locally: loopback needs no relay. Production enables it (module 05).
turn:
  enabled: false
```

### `docker/Dockerfile.dev`

One image for all three Node services; they differ only by command in Compose.

```dockerfile
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

# Dependencies are installed into the image so the bind mount does not carry
# node_modules across the host boundary — that is the slow part on macOS.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json      apps/api/
COPY apps/agent/package.json    apps/agent/
COPY apps/web/package.json      apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
```

Anonymous volumes in Compose mask `node_modules` on the bind mount so the image's
installed dependencies win over whatever is on the host.

### `.env.example`

```
# Copy to .env — docker compose reads it automatically. .env is gitignored.

LIVEKIT_API_SECRET=devsecret_change_me_at_least_32_chars
BETTER_AUTH_SECRET=dev_auth_secret_change_me_at_least_32ch
GUEST_TOKEN_SECRET=dev_guest_secret_change_me_at_least_32c

# Real credentials. Sign-in and translation stay unavailable until these are set;
# everything else runs without them.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
```

## Lint and format

**Biome.** One binary, one `biome.json` at the root, replacing ESLint and
Prettier. Chosen because it is a single dependency doing two jobs and is fast
enough to run on save across a monorepo.

Open question carried from the main spec: Biome's Tailwind class sorting is
experimental. Verify its status when scaffolding. If it is not reliable, add
Prettier with `prettier-plugin-tailwindcss` for that one job and leave Biome
doing everything else — do not replace Biome wholesale.

TypeScript is checked separately with `tsc --noEmit`; Biome does not typecheck.

## Git hooks

**Lefthook**, one `lefthook.yml`:

```yaml
pre-commit:
  commands:
    check: { glob: "*.{ts,tsx,json}", run: "biome check --write {staged_files}", stage_fixed: true }
pre-push:
  parallel: true
  commands:
    types: { run: "pnpm -r exec tsc --noEmit" }
    unit:  { run: "pnpm vitest run" }
```

E2E does not run on pre-push. It runs in CI.

## Storybook

React + Vite builder, with the a11y and Vitest addons. Verify package names and
the current major version when scaffolding.

Storybook is the component workbench **and** the component test environment.
Stories run as tests in a real browser through the Vitest addon, so there is no
separate jsdom + Testing Library layer. A story is the test setup; `play`
functions cover interaction.

The a11y addon runs on every story. Violations fail CI.

### Fake media for stories

Video components need a `MediaStream` with no camera and no permission prompt.
A canvas stream provides one:

```ts
// .storybook/fakeStream.ts
export function fakeStream(label: string) {
  const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 })
  const ctx = c.getContext('2d')!
  let t = 0
  setInterval(() => {                    // ponytail: moving pixels beat a fixture video file
    ctx.fillStyle = `hsl(${(t += 2) % 360} 45% 22%)`
    ctx.fillRect(0, 0, 640, 360)
    ctx.fillStyle = '#F5F5F7'
    ctx.font = '28px sans-serif'
    ctx.fillText(label, 24, 48)
  }, 40)
  return c.captureStream(30)
}
```

The same helper feeds Playwright specs.

## Test strategy

| Layer | Tool | Notes |
|---|---|---|
| Components | Stories via the Vitest addon | Real browser, not jsdom |
| Pure logic | Vitest | Language routing, code generation and parsing |
| API routes | Vitest + Fastify `app.inject()` | No HTTP server, no port allocation |
| Database | Real Postgres in Docker, fresh schema per run | Mocking Drizzle tests the mock, not the SQL |
| Two-browser call | Playwright | See below |

### The E2E that matters

Playwright launches Chromium with `--use-fake-device-for-media-capture` and
`--use-fake-ui-for-media-stream`, so `getUserMedia` returns a synthetic stream
and permission is granted without a dialog. A `.y4m` video and a `.wav` file can
be supplied as the fake devices.

That makes one spec possible that is worth more than the rest combined: two
browser contexts join the same room, and the spec asserts that B renders A's
track, that muting in A shows a muted indicator in B, and that a chat message
from A arrives in B.

### What is not tested

LiveKit. OpenAI. The video grid's CSS. No snapshot tests. No coverage threshold —
a number that rises by testing getters is a number that lies.

Features are built test-first.

## CI

One GitHub Actions workflow, in order:

```
biome ci  →  tsc --noEmit  →  vitest run  →  build  →  playwright test
```

Postgres runs as a service container. Playwright runs against the built SPA and
a locally started API, with the agent stubbed — CI does not call OpenAI.

## Done when

- `docker compose up -d` gives healthy postgres, redis and livekit
- `docker compose --profile apps up` starts web, api and agent with hot reload
- A fresh clone reaches a running stack with only `cp .env.example .env`
- `pnpm check`, `pnpm test`, `pnpm storybook` all run from the root
- A trivial component has a story that passes as a test in CI
- The two-browser Playwright spec runs green against a local LiveKit instance
