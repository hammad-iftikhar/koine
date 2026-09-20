# 0006. The LiveKit room name is the meeting's id, not its code

**Status:** Accepted
**Decided:** module 04 (meetings), review round R22 · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/modules/meeting/meeting.controller.ts`, `apps/agent/src/room.ts`

## Context

The obvious room name is the meeting code — it is the identifier people already
have, and it makes debugging a call against LiveKit's dashboard trivial.

It is also this system's only credential (see
[0005](0005-meeting-code-is-the-only-credential.md)), and it never rotates.
Room names reach LiveKit's server logs, webhooks, metrics labels and dashboard.

## Decision

The room is the meeting's UUID. The code is never sent to LiveKit.

## Consequences

- A permanent join credential stays out of every observability surface it would
  otherwise have been written to in plain text.
- Correlating a LiveKit room to a meeting takes a database lookup.
- This has been proposed as a cleanup more than once. Both the API controller
  and the agent's room module carry an `R22` comment saying not to; changing it
  back is a security regression, not a tidy-up.
