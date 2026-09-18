# Koine Auth & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google sign-in for hosts, guest identity for everyone else, and the Postgres test harness every later plan depends on.

**Architecture:** Better Auth owns sessions in Postgres through Drizzle. Guests never get a session — they get a short-lived token scoped to one meeting, signed with a different secret. The API is stateless: session lookup hits the database on every request.

**Tech Stack:** Better Auth, Drizzle ORM, Postgres 17, Fastify, Zod, TanStack Query.

**Spec:** [`../specs/2026-09-18-koine/03-auth-identity.md`](../specs/2026-09-18-koine/03-auth-identity.md)

## Global Constraints

- **Node 22**, pnpm, TypeScript. Test-first.
- **Zod schemas live in `packages/shared`.** No hand-written duplicate interfaces.
- **Trust boundaries get tests regardless of what the client does.**
- **Secrets are server-side only.** The Google client secret never reaches the browser.
- **Errors say what to do.** Not "401", but what the person should do next.
- **Never mock Drizzle.** Tests run against real Postgres.
- **`GUEST_TOKEN_SECRET` is separate from `BETTER_AUTH_SECRET`** by design — leaking one must not compromise the other.
- Dark theme only; colours come from tokens.

---

## File Structure

```
apps/api/src/
  db/client.ts              drizzle instance, pool
  db/schema.ts              Better Auth tables + re-export point for later plans
  auth.ts                   betterAuth() config
  routes/me.ts              GET /api/me
  routes/me.test.ts
  guest.ts                  sign/verify guest tokens
  guest.test.ts
  test/db.ts                per-run schema harness
drizzle.config.ts
apps/web/src/lib/
  api.ts                    fetch wrapper with credentials
  auth.ts                   useMe() hook, signIn(), signOut()
packages/shared/src/
  auth.ts                   MeResponse zod schema
```

---

### Task 1: Drizzle and the Postgres test harness

Deferred from plan 01 on purpose — there was nothing to store. There is now.

**Files:**
- Create: `apps/api/src/db/client.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/test/db.ts`, `drizzle.config.ts`
- Modify: `apps/api/package.json`, `apps/api/vitest.config.ts`

**Interfaces:**
- Produces: `db` (Drizzle instance) from `src/db/client.ts`
- Produces: `withTestDb()` from `src/test/db.ts` — **every later plan's database test uses this.**

- [ ] **Step 1: Install**

Run: `pnpm --filter @koine/api add drizzle-orm postgres better-auth`
Run: `pnpm --filter @koine/api add -D drizzle-kit`

- [ ] **Step 2: Create the database client**

`apps/api/src/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

// max: 10 per process. Every API instance holds its own pool, so this number
// multiplies by instance count — see spec module 08 on PgBouncer.
export const sql = postgres(url, { max: 10 })
export const db = drizzle(sql, { schema })
```

- [ ] **Step 3: Create the Better Auth schema**

`apps/api/src/db/schema.ts`:
```ts
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Better Auth's required shape. Generated once, then committed — do not
// hand-edit column names, the library looks them up by name.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

- [ ] **Step 4: Create the Drizzle config**

`drizzle.config.ts` at the repo root:
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './apps/api/src/db/schema.ts',
  out: './apps/api/drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine' },
})
```

Add to `apps/api/package.json` scripts:
```json
"db:generate": "drizzle-kit generate --config ../../drizzle.config.ts",
"db:migrate": "drizzle-kit migrate --config ../../drizzle.config.ts"
```

- [ ] **Step 5: Generate and apply the first migration**

Run: `docker compose up -d postgres`
Run: `pnpm --filter @koine/api db:generate`
Run: `pnpm --filter @koine/api db:migrate`
Expected: `apps/api/drizzle/` contains a `.sql` file; the four tables exist.

Verify: `docker compose exec -T postgres psql -U koine -d koine -c '\dt'`
Expected: `user`, `session`, `account`, `verification`.

- [ ] **Step 6: Write the test harness**

`apps/api/src/test/db.ts`:
```ts
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

const BASE = process.env.DATABASE_URL ?? 'postgres://koine:koine@localhost:5432/koine'

/**
 * A fresh, isolated schema per test file. Real Postgres, real SQL, real
 * constraints — mocking Drizzle would test the mock.
 *
 * ponytail: a `search_path` schema, not a separate database. Creating a database
 * per file takes seconds; creating a schema takes milliseconds.
 */
export async function withTestDb() {
  const name = `t_${randomBytes(6).toString('hex')}`
  const admin = postgres(BASE, { max: 1 })
  await admin.unsafe(`CREATE SCHEMA "${name}"`)
  await admin.end()

  const url = `${BASE}?options=-c%20search_path%3D${name}`
  execSync('pnpm drizzle-kit migrate --config ../../drizzle.config.ts', {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const sql = postgres(url, { max: 4 })
  const db = drizzle(sql, { schema })

  return {
    db,
    sql,
    async destroy() {
      await sql.end()
      const cleanup = postgres(BASE, { max: 1 })
      await cleanup.unsafe(`DROP SCHEMA "${name}" CASCADE`)
      await cleanup.end()
    },
  }
}
```

- [ ] **Step 7: Write a test proving the harness isolates**

`apps/api/src/test/db.test.ts`:
```ts
import { expect, it } from 'vitest'
import { user } from '../db/schema'
import { withTestDb } from './db'

it('gives each caller an empty, isolated schema', async () => {
  const a = await withTestDb()
  const b = await withTestDb()

  await a.db.insert(user).values({ id: 'u1', name: 'Alice', email: 'alice@example.com' })

  expect(await a.db.select().from(user)).toHaveLength(1)
  // If this is 1, the harness is sharing a schema and every later test lies.
  expect(await b.db.select().from(user)).toHaveLength(0)

  await a.destroy()
  await b.destroy()
})

it('enforces the unique email constraint', async () => {
  const t = await withTestDb()
  await t.db.insert(user).values({ id: 'u1', name: 'A', email: 'same@example.com' })

  await expect(
    t.db.insert(user).values({ id: 'u2', name: 'B', email: 'same@example.com' }),
  ).rejects.toThrow()

  await t.destroy()
})
```

- [ ] **Step 8: Run it**

Run: `pnpm --filter @koine/api test db`
Expected: PASS — 2 tests. If the isolation test fails, stop: every later database test in every plan is worthless until it passes.

- [ ] **Step 9: Commit**

```bash
git add apps/api drizzle.config.ts
git commit -m "feat(api): drizzle schema and isolated postgres test harness"
```

---

### Task 2: Better Auth and GET /api/me

**Files:**
- Create: `apps/api/src/auth.ts`, `apps/api/src/routes/me.ts`, `apps/api/src/routes/me.test.ts`
- Create: `packages/shared/src/auth.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `auth` from `src/auth.ts`, `getSession(request)` helper
- Produces from `@koine/shared`: `MeResponse` Zod schema and its inferred type
- Produces: `GET /api/me` → `{ user: {...} } | { user: null }`

- [ ] **Step 1: Write the shared schema**

`packages/shared/src/auth.ts`:
```ts
import { z } from 'zod'

export const MeUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
})

export const MeResponse = z.object({ user: MeUser.nullable() })

export type MeUser = z.infer<typeof MeUser>
export type MeResponse = z.infer<typeof MeResponse>
```

Run: `pnpm --filter @koine/shared add zod`
Add to `packages/shared/src/index.ts`:
```ts
export { MeResponse, MeUser } from './auth'
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/routes/me.test.ts`:
```ts
import { MeResponse } from '@koine/shared'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../app'

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

it('returns a null user rather than 401 when signed out', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/me' })

  // 401 would make the home screen look broken for a visitor who has simply
  // not signed in yet. Signed out is a state, not an error.
  expect(res.statusCode).toBe(200)
  expect(MeResponse.parse(res.json())).toEqual({ user: null })
})

it('rejects a session cookie that does not exist', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: 'better-auth.session_token=made-up-value' },
  })

  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ user: null })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @koine/api test me`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 4: Configure Better Auth**

`apps/api/src/auth.ts`:
```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db/client'
import * as schema from './db/schema'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')

export const auth = betterAuth({
  secret,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    cookies: { sessionToken: { attributes: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' } } },
  },
})
```

- [ ] **Step 5: Mount auth and write the route**

`apps/api/src/routes/me.ts`:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { auth } from '../auth'

/** Converts Fastify headers into the Headers object Better Auth expects. */
export function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  return headers
}

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', async (request) => {
    const result = await auth.api.getSession({ headers: toHeaders(request) })
    if (!result?.user) return { user: null }

    const { id, name, email, image } = result.user
    return { user: { id, name, email, image: image ?? null } }
  })
}
```

Modify `apps/api/src/app.ts` to register auth's handler and the route:
```ts
import Fastify, { type FastifyInstance } from 'fastify'
import { auth } from './auth'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { toHeaders } from './routes/me'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Better Auth handles its own routes under /api/auth/*.
  app.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    const response = await auth.handler(
      new Request(url, {
        method: request.method,
        headers: toHeaders(request),
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : JSON.stringify(request.body),
      }),
    )
    reply.status(response.status)
    response.headers.forEach((value, key) => reply.header(key, value))
    return reply.send(await response.text())
  })

  await app.register(healthRoutes)
  await app.register(meRoutes)
  return app
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `docker compose up -d postgres && pnpm --filter @koine/api test me`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): better auth with google provider and GET /api/me"
```

---

### Task 3: Guest tokens

The trust boundary. A guest token scoped to meeting A must be useless for meeting B.

**Files:**
- Create: `apps/api/src/guest.ts`, `apps/api/src/guest.test.ts`

**Interfaces:**
- Produces:
```ts
type GuestClaims = { meetingCode: string; displayName: string; speakLang: string; hearLang: string }
function signGuestToken(claims: GuestClaims, ttlSeconds?: number): string
function verifyGuestToken(token: string, expectedMeetingCode: string): GuestClaims | null
```
  Plan 04's join endpoint issues these; plan 07 verifies them.

- [ ] **Step 1: Write the failing test**

`apps/api/src/guest.test.ts`:
```ts
import { beforeAll, expect, it } from 'vitest'
import { signGuestToken, verifyGuestToken } from './guest'

const claims = {
  meetingCode: 'kxvnvradwq',
  displayName: 'Mariam',
  speakLang: 'es',
  hearLang: 'en',
}

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET ??= 'test_guest_secret_at_least_32_characters'
})

it('round-trips valid claims', () => {
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toEqual(claims)
})

it('rejects a token minted for a different meeting', () => {
  // The trust boundary. If this ever passes, one code grants every room.
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'aaaaaaaaaa')).toBeNull()
})

it('rejects a tampered payload', () => {
  const token = signGuestToken(claims)
  const [header, payload, sig] = token.split('.')
  const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString())
  forged.meetingCode = 'aaaaaaaaaa'
  const swapped = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`
  expect(verifyGuestToken(swapped, 'aaaaaaaaaa')).toBeNull()
})

it('rejects an expired token', () => {
  const token = signGuestToken(claims, -1)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toBeNull()
})

it('rejects garbage without throwing', () => {
  expect(verifyGuestToken('not-a-token', 'kxvnvradwq')).toBeNull()
  expect(verifyGuestToken('', 'kxvnvradwq')).toBeNull()
  expect(verifyGuestToken('a.b.c', 'kxvnvradwq')).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/api test guest`
Expected: FAIL — cannot resolve `./guest`.

- [ ] **Step 3: Write the implementation**

`apps/api/src/guest.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export type GuestClaims = {
  meetingCode: string
  displayName: string
  speakLang: string
  hearLang: string
}

type Payload = GuestClaims & { exp: number }

const DEFAULT_TTL = 60 * 60 * 6

function secret(): string {
  const value = process.env.GUEST_TOKEN_SECRET
  if (!value) throw new Error('GUEST_TOKEN_SECRET is not set')
  // Deliberately NOT BETTER_AUTH_SECRET: leaking a guest token's key must not
  // let anyone forge a host session.
  return value
}

const b64 = (input: string) => Buffer.from(input).toString('base64url')

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export function signGuestToken(claims: GuestClaims, ttlSeconds = DEFAULT_TTL): string {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'guest' }))
  const payload: Payload = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = b64(JSON.stringify(payload))
  return `${header}.${body}.${sign(`${header}.${body}`)}`
}

export function verifyGuestToken(token: string, expectedMeetingCode: string): GuestClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts as [string, string, string]

  const expected = Buffer.from(sign(`${header}.${body}`))
  const actual = Buffer.from(signature)
  // Constant-time: a length check first, because timingSafeEqual throws on
  // mismatched lengths and an exception is itself a timing signal.
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  if (payload.meetingCode !== expectedMeetingCode) return null

  const { meetingCode, displayName, speakLang, hearLang } = payload
  return { meetingCode, displayName, speakLang, hearLang }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/api test guest`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/guest.ts apps/api/src/guest.test.ts
git commit -m "feat(api): meeting-scoped guest tokens"
```

---

### Task 4: Web sign-in

**Files:**
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `apiFetch<T>(path, init?)` — every later web plan uses it
- Produces: `useMe()` returning `{ user, isLoading }`, plus `signInWithGoogle()` and `signOut()`

- [ ] **Step 1: Install**

Run: `pnpm --filter @koine/web add @tanstack/react-query`

- [ ] **Step 2: Create the fetch wrapper**

`apps/web/src/lib/api.ts`:
```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Sessions are cookies. Without this the browser sends none and every
    // request looks signed out.
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new ApiError(res.status, body?.message ?? 'Something went wrong. Please try again.')
  }

  return (await res.json()) as T
}
```

- [ ] **Step 3: Create the auth hooks**

`apps/web/src/lib/auth.ts`:
```ts
import { MeResponse } from '@koine/shared'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export function useMe() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => MeResponse.parse(await apiFetch('/api/me')),
    staleTime: 5 * 60 * 1000,
  })
  return { user: query.data?.user ?? null, isLoading: query.isLoading }
}

export function signInWithGoogle(callbackURL = window.location.href): void {
  const url = new URL('/api/auth/sign-in/social', BASE)
  url.searchParams.set('provider', 'google')
  url.searchParams.set('callbackURL', callbackURL)
  window.location.assign(url.toString())
}

export async function signOut(): Promise<void> {
  await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' })
  window.location.reload()
}
```

- [ ] **Step 4: Wire the query client and render sign-in state**

`apps/web/src/main.tsx` — wrap the app:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')

const queryClient = new QueryClient()

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

`apps/web/src/App.tsx`:
```tsx
import { signInWithGoogle, signOut, useMe } from './lib/auth'

export function App() {
  const { user, isLoading } = useMe()

  return (
    <main style={{ padding: 24 }}>
      <h1 data-testid="app-title">Koine</h1>
      {isLoading ? (
        <p className="text-fg-2">Checking your session…</p>
      ) : user ? (
        <p data-testid="signed-in">
          Signed in as {user.email}{' '}
          <button type="button" onClick={signOut} className="text-blue underline">
            Sign out
          </button>
        </p>
      ) : (
        <button
          type="button"
          data-testid="sign-in"
          onClick={() => signInWithGoogle()}
          className="rounded-full bg-blue px-5 py-3 font-semibold text-white"
        >
          Continue with Google
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Add an E2E covering the signed-out path**

Append to `apps/web/e2e/smoke.spec.ts`:
```ts
test('a visitor who is not signed in sees a sign-in button, not an error', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('sign-in')).toBeVisible()
  await expect(page.getByTestId('signed-in')).toHaveCount(0)
})
```

This requires the API running. Start it first: `docker compose --profile apps up -d api`

- [ ] **Step 6: Run everything**

Run: `pnpm --filter @koine/web e2e`
Expected: PASS.

- [ ] **Step 7: Verify Google sign-in by hand**

Set real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, with
`http://localhost:3000/api/auth/callback/google` added as an authorised redirect
URI in the Google Cloud console. Restart the API, click "Continue with Google".
Expected: you return signed in, and `GET /api/me` shows your profile.

If the redirect URI is not allow-listed Google shows `redirect_uri_mismatch` —
that is a console setting, not a code bug.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): google sign-in and session state"
```

---

## Done when

- [ ] Google sign-in completes and `GET /api/me` returns the profile
- [ ] Signed out returns `{ user: null }` with status 200, never 401
- [ ] The cross-meeting guest token test passes
- [ ] `withTestDb()` proves isolation between two callers
- [ ] A revoked session is rejected on the next request

## Open item carried from the spec

**Guest display names: free text, or constrained?** Free text is impersonation
surface in a room the host did not curate. The spec's default is free text plus a
"guest" marker on the tile that cannot be removed. Implement that default in plan 04's
pre-join unless told otherwise, and note the decision there.
