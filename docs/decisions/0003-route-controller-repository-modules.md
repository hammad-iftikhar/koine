# 0003. Split the API into route / controller / repository modules

**Status:** Accepted
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/modules/*`

## Context

Each API feature was one file under `src/routes/`. `meetings.ts` had grown to
288 lines holding, at once: URL registration, Fastify generic parameters,
rate-limit policy constants, session lookup, Zod validation, LiveKit token
minting, guest-token signing, and seven hand-written Drizzle queries. Finding
the SQL meant reading past the HTTP, and the file was the single place both
concerns could break.

## Decision

One folder per feature under `src/modules/`, with up to three files:

- `<feature>.route.ts` — URL, method and Fastify generics. Nothing else.
- `<feature>.controller.ts` — validation, authorization, business rules,
  status codes and response shape.
- `<feature>.repository.ts` — every Drizzle query for that feature, and
  nothing that knows what an HTTP request is.

Features with no data access get fewer files: `health` is a route only, `me`
is route plus controller. A repository with no queries in it would be an empty
file kept for symmetry.

Two request-level guards — `currentUserId` and `enforceRateLimit`, plus the
limit constants — are shared by `meeting` and `message`, so they live in
`src/guards.ts` rather than in either module.

## Consequences

- Where a change goes is now a question with one answer: SQL in the
  repository, rules in the controller, URLs in the route.
- `message` reads `findMeetingByCode` from `meeting`'s repository. A message
  belongs to a meeting, so a cross-module repository import is expected here,
  not a smell to design away.
- `guards.ts` calls `consume` through the `@/rate-limit` module binding on
  purpose. `apps/api/tests/modules/meeting/meeting.route.test.ts` spies on that
  export to drive the fail-open path in [0007](0007-rate-limiter-fails-open.md);
  inlining `consume` into `guards.ts` would make that test silently vacuous.
- More files. The split earns itself on `meeting` and `message` and is
  overhead on `me` — which is why `me` did not get all three.
