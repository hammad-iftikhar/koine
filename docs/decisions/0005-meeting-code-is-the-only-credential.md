# 0005. The meeting code is the only credential for joining

**Status:** Accepted
**Decided:** module 04 (meetings) · **Recorded:** 2026-09-20
**Lives in:** `packages/shared/src/meeting-code.ts`, `apps/api/src/modules/meeting/`

## Context

Joining a meeting has to work for someone who has never signed in, from a link
pasted into a chat. Anything stronger than a link — an account, an invite list,
a per-guest token issued in advance — makes the common case worse.

## Decision

A 10-character code drawn from a 25-letter alphabet (`l` excluded: unreadable
next to `1` and `I`), formatted `abc-defg-hij`. Letters come from a CSPRNG via
rejection sampling, not `% 25` — 2^32 is not a multiple of 25, so plain modulo
would make the first six letters fractionally likelier and quietly shrink the
keyspace of every code ever issued.

Holding the code is sufficient to look up, join, leave, post to and read a
meeting. Only *ending* a meeting needs more: that checks the host's session.

## Consequences

- 25^10 ≈ 9.5 × 10^13 codes. Guessing is not the threat; enumeration is, which
  is what the rate limiter in [0007](0007-rate-limiter-fails-open.md) exists for.
- The code never rotates, so it must not leak into logs or metrics. That is the
  whole reason for [0006](0006-livekit-room-is-the-meeting-id.md).
- Anyone with the code can read the room's full chat backlog. That is the
  intended reading of "the link is the invite", not an oversight.
