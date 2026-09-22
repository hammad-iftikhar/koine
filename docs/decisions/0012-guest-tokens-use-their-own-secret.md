# 0012. Guest tokens are HMAC-signed with their own secret

**Status:** Accepted
**Decided:** module 04 (meetings) · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/guest.ts`

## Context

Someone who joins without signing in still needs to carry their identity —
display name, spoken language, heard language — across a page reload. A
database row per guest would mean a write and a lookup for something that is
worthless six hours later.

## Decision

A self-contained token: base64url header, claims plus `exp`, and an HMAC-SHA256
signature, with a 6-hour default TTL. Verified with `timingSafeEqual`.

The key is `GUEST_TOKEN_SECRET`, deliberately **not** `BETTER_AUTH_SECRET`.
Leaking a guest token's key must not let anyone forge a host session.

Of the reasons a token can fail, only `expired` is ever shown to a person; the
rest are indistinguishable from the outside.

## Consequences

- No storage, no lookup, no cleanup.
- A token cannot be revoked before it expires. Six hours is the bound.
- Two secrets to provision instead of one.
