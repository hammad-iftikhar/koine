# 0009. `LIVEKIT_PUBLIC_URL` must be set explicitly in production

**Status:** Accepted
**Decided:** module 04 (meetings), review round R25 · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/modules/meeting/meeting.controller.ts` (`livekitPublicUrl`)

## Context

The join response carries `livekitUrl`, the browser-reachable SFU address. A
development default of `ws://localhost:7880` is convenient and, shipped to
production, produces a call that mints a valid token nobody can connect with —
with no error on the server side to explain it.

## Decision

Development keeps the default. When `NODE_ENV === 'production'` and
`LIVEKIT_PUBLIC_URL` is unset, the join request throws.

The URL is resolved before the participant row is inserted, in the same
fail-before-writing group as the token mint, so the throw cannot leave a
phantom participant in the roster.

## Consequences

- A misconfigured production deploy fails loudly at the first join instead of
  silently shipping broken calls.
- It fails per request, not at boot. Deliberate: the API's other routes keep
  working while LiveKit is misconfigured.
