import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { FastifyRequest } from 'fastify'
import { db } from './db/client'
import * as schema from './db/schema'
import { webOrigins } from './origins'

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')

type Database = Parameters<typeof drizzleAdapter>[0]

/**
 * Better Auth bound to a specific Drizzle database.
 *
 * Exported as a factory so a test can point it at an isolated database from
 * withTestDb() rather than writing into the shared dev one.
 */
export function createAuth(database: Database) {
  return betterAuth({
    secret,
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    // The origins allowed to hand us a callbackURL. Better Auth otherwise
    // trusts only its own baseURL origin, so every absolute callbackURL the
    // SPA can produce comes back as INVALID_CALLBACK_URL. Same source as the
    // CORS allow-list (see ./origins) so the two cannot disagree.
    trustedOrigins: webOrigins(),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      // Explicit, not inherited: Better Auth enables rate limiting only when
      // NODE_ENV is "production", and the spec requires sign-in attempts to
      // be limited per IP wherever this runs.
      //
      // Ceiling: 100 requests per minute per IP across /api/auth/*, and 10
      // per minute on sign-in specifically.
      //
      // Storage is Better Auth's in-memory default, so those counters are
      // per process and lost on restart. Once the API runs more than one
      // instance the upgrade path is `secondaryStorage` backed by Redis,
      // which is already in the stack — Better Auth then keeps the counters
      // there automatically. Deliberately not wired yet: one process today.
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/*': { window: 60, max: 10 },
      },
    },
    advanced: {
      // Better Auth silently skips origin and callbackURL validation when
      // NODE_ENV is "test", which would make every test of that boundary
      // vacuous. false is already the behaviour everywhere else; saying it
      // out loud means the tests exercise the same code production does.
      disableOriginCheck: false,
      // No `cookies` override on purpose. Better Auth's defaults already give
      // the session cookie HttpOnly, SameSite=Lax and Path=/, and derive
      // Secure from the base URL rather than from NODE_ENV — stricter than
      // what we would write by hand. An override would also have to be keyed
      // by the runtime cookie name (`session_token`); a camelCase
      // `sessionToken` key typechecks against an index signature and is
      // never read.
    },
  })
}

export const auth = createAuth(db)

/** Converts Fastify headers into the Headers object Better Auth expects. */
export function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  return headers
}

/** Resolves the caller's Better Auth session, if any, from a Fastify request. */
export function getSession(request: FastifyRequest) {
  return auth.api.getSession({ headers: toHeaders(request) })
}
