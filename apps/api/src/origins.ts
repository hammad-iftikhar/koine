const DEFAULT_WEB_ORIGINS = 'http://localhost:5173,http://localhost:4173'

/**
 * The browser origins allowed to talk to this API.
 *
 * One list, two consumers: the CORS allow-list in app.ts and Better Auth's
 * `trustedOrigins` in auth.ts. Parsed in one place so they cannot drift — a
 * callbackURL the SPA is allowed to send must be one CORS would also accept.
 */
export function webOrigins(value = process.env.WEB_ORIGIN): string[] {
  const origins = (value ?? DEFAULT_WEB_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  if (origins.includes('*')) {
    // @fastify/cors replaces the entire allow-list with '*' the moment one
    // entry is '*' (index.js:145-146). Combined with credentials: true that
    // is a CSRF hole, so refuse loudly at boot instead of silently widening.
    throw new Error(
      'WEB_ORIGIN must not contain "*". Combined with credentials: true, a ' +
        'wildcard allow-list is a CSRF hole. List every origin explicitly, ' +
        'e.g. WEB_ORIGIN=https://app.example.com,https://staging.example.com',
    )
  }

  if (origins.length === 0) {
    throw new Error('WEB_ORIGIN is set but lists no origins. Unset it to use the defaults.')
  }

  return origins
}
