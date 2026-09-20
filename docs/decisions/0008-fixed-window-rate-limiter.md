# 0008. Fixed-window rate limiter, not sliding

**Status:** Accepted
**Decided:** module 04 (meetings) · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/rate-limit.ts`

## Context

The limiter defends against meeting-code guessing. A sliding window is more
accurate and costs a sorted set per key plus the code to trim it.

## Decision

`INCR` then `EXPIRE ... NX`, both in one `MULTI` so the two cannot interleave
with another instance's — an `INCR` that never gets its TTL is a counter that
blocks its key forever. Marked `ponytail:` in the source.

A command error inside the transaction is rethrown rather than falling through:
a `WRONGTYPE` on a colliding key must surface as a fault, not silently become
`{ allowed: false, remaining: NaN }`.

## Consequences

- A burst straddling a window boundary gets roughly 2× the nominal limit. For
  code-guessing defence that is immaterial.
- Upgrade path, if this ever guards something priced per call: swap to a sliding
  window. The `consume` signature does not change.
- Better Auth runs its own separate in-memory limiter on `/api/auth/*`, per
  process and lost on restart. Once the API runs more than one instance, that
  one needs `secondaryStorage` pointed at the Redis already in the stack.
