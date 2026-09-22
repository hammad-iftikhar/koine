# 0007. The meeting rate limiter fails open

**Status:** Accepted
**Decided:** module 04 (meetings), review round R24 · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/guards.ts` (`enforceRateLimit`)

## Context

Every route taking a meeting code from an unauthenticated caller leaks whether
that code exists — lookup by its status, join by inserting, end by answering 404
versus 403 — so all of them are throttled per IP, each in its own Redis bucket.

Redis is then in the request path of joining a call. A Redis blip would turn
into a 500 on every meeting route.

## Decision

A failure from `consume` is logged at warn and the request is allowed through.

## Consequences

- An infrastructure fault degrades the secondary defence instead of taking down
  the product. The primary defence is the code's own entropy
  ([0005](0005-meeting-code-is-the-only-credential.md)), which does not depend
  on Redis being up.
- An attacker who can take Redis down can enumerate codes unthrottled. Given the
  keyspace, that trade was judged acceptable.
- `enforceRateLimit` must keep calling `consume` through the `@/rate-limit`
  module binding — the test for this path spies on that export. See
  [0003](0003-route-controller-repository-modules.md).
