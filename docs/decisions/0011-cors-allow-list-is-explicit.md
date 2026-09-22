# 0011. One explicit origin allow-list, shared by CORS and auth

**Status:** Accepted
**Decided:** module 03 (auth & identity) · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/origins.ts`

## Context

Two things need to know which browser origins are trusted: the CORS allow-list,
and Better Auth's `trustedOrigins` (without which every absolute `callbackURL`
the SPA can produce comes back as `INVALID_CALLBACK_URL`). Kept separately they
would drift, and a `callbackURL` the SPA is allowed to send must be one CORS
would also accept.

## Decision

`webOrigins()` parses `WEB_ORIGIN` once; `app.ts` and `auth.ts` both read it.

A `*` entry throws at boot. `@fastify/cors` replaces the entire allow-list with
`*` the moment one entry is `*`, and combined with `credentials: true` that is a
CSRF hole — so it refuses loudly rather than silently widening. An empty list
throws too, rather than falling back to the defaults, since that is more likely
a typo in the deploy config than an intent.

Related, in `app.ts`: `x-forwarded-for` is overwritten with `request.ip` before
handing the request to Better Auth, so its own limiter buckets per caller
instead of collapsing everyone into one. That is correct **only** because the
API is exposed directly with Fastify's `trustProxy` off. Putting this behind an
ingress means turning `trustProxy` on and switching to Better Auth's
`advanced.ipAddress.trustedProxies` in the same change.

## Consequences

- The two lists cannot disagree.
- Every new frontend origin is a deploy-config change. Intended.
- The wildcard escape hatch does not exist, on purpose.
