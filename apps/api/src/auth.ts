import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { FastifyRequest } from 'fastify'
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
    cookies: {
      sessionToken: {
        attributes: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      },
    },
  },
})

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
