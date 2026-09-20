# 0015. The agent's caption bus is in-process, a Map of Sets

**Status:** Accepted
**Decided:** module 06 (translation) · **Recorded:** 2026-09-20
**Lives in:** `apps/agent/src/bus.ts`

## Context

The transcriber and the synthesizers need a seam between them. Today they run in
one process; spec module 06 anticipates synthesizers moving to their own workers.

## Decision

A `Map<roomId, Set<handler>>`. Marked `ponytail:` — room-scoped keys are the
entire requirement, and Node's `EventEmitter` starts printing max-listener
warnings at 11 rooms. A handler that throws is caught and logged: one
synthesizer failing must not silence the others.

## Consequences

- No dependency, no warnings, no lifecycle to manage.
- In-process only. When synthesizers move to workers this becomes the LiveKit
  data channel, which already carries `CaptionSegment` for client captions — so
  there is no new transport to build, just a different implementation behind the
  same publish/subscribe shape.
