# Koine — Design Spec

**Date:** 2026-09-18
**Status:** Approved for planning
**Modules:** see [index](#module-index)

## What Koine is

A browser meeting app where participants speak their own language and hear the
room in theirs. Each listener receives a synthesized voice track in their chosen
language, mixed over a ducked original, plus bilingual captions showing what was
actually said alongside the translation.

## Scope

**In v1**

- Google sign-in
- Create a meeting, share it as a link or a code
- Join by link or by code, with or without an account
- Camera and microphone control, with mute and speaking indicators
- Screen sharing
- In-call chat, translated per reader
- Live translation: synthesized audio **and** captions
- Up to 25+ participants in one meeting

**Not in v1**

- Recording. The approved mockup shows a "Rec" chip in the bottom-left; it was
  never requested and is not specified here. Remove it from the UI or gate it
  behind a flag that is off. See [module 02](2026-09-18-koine/02-design-system.md).
- Calendar integration, waiting rooms, breakout rooms, host moderation controls,
  virtual backgrounds, mobile native apps.

## Architecture

```
Browser (Vite SPA)  ──REST──▶  Node API (Fastify)  ──▶ Postgres
      │                              │
      │                              └── mints LiveKit access tokens
      │
      └──WebRTC + data──▶  LiveKit SFU  ◀──publishes tracks── Translation Agent
                           (self-hosted)
                                                                    │
                                                                    └──▶ OpenAI
```

Deployable units: the static SPA, the API, the agent worker, the LiveKit SFU,
Postgres and Redis. **LiveKit is self-hosted** — see
[module 08](2026-09-18-koine/08-deployment.md).

### Two decisions that shape everything

**Translation channels are per language, not per listener.** The agent publishes
one audio track for each target language in use, and each participant subscribes
to the one matching their setting. Twenty-five people speaking four languages
costs four TTS streams, not twenty-five. Cost stays flat as the room grows.

**LiveKit owns signalling, so the API stays small.** No custom WebSocket server.
The API does Google auth, meeting records, token minting and chat persistence —
a plain REST service.

## Scaling model

The application is built to scale horizontally. Each unit is addressed
explicitly below; the detail lives in [module 08](2026-09-18-koine/08-deployment.md).

| Unit | Scales | How |
|---|---|---|
| Web | Horizontally | Static build on a CDN |
| API | Horizontally | Stateless; no long-lived connections, sessions in Postgres |
| Agent | Horizontally, per room | LiveKit dispatches rooms across a worker pool |
| Postgres | Vertically, then read replicas | Write load is joins, leaves and messages |
| Redis | Vertically | Shared counters only, not a data store |
| SFU | Horizontally, per room | Self-hosted LiveKit nodes coordinating through Redis |

**The structural win:** because LiveKit owns signalling, the API holds no
connections. No sticky sessions, no shared connection registry, no pub/sub to fan
events between instances — the usual reason meeting backends resist scaling does
not apply here. Put the API behind a load balancer and add instances.

**The structural limit, in two places.** A room lives on one SFU node, and a
room's translation runs on one agent worker. Rooms distribute across nodes and
workers; a room does not split across either. Participant count scales cheaply up
to what one machine can forward; simultaneous language count in one room does not
scale at all until the synthesizer role is split (module 06).

**Every meeting uses the SFU.** A peer-to-peer path for small meetings was
considered and rejected — the reasoning is recorded in
[module 05](2026-09-18-koine/05-realtime-media.md) so it is not re-litigated.

**Shared state lives in Redis**, which exists to do three jobs that break when
counted per process: rate limits, per-meeting spend ceilings, and agent channel
recovery. Scheduled work is serialised with a Postgres advisory lock instead —
no extra infrastructure for something that runs once a minute.

## Module index

| # | Module | Covers |
|---|---|---|
| 01 | [Foundation](2026-09-18-koine/01-foundation.md) | Monorepo, Biome, Lefthook, Vitest, Playwright, Storybook, CI |
| 02 | [Design system](2026-09-18-koine/02-design-system.md) | Tokens, component inventory, presentational/container split |
| 03 | [Auth & identity](2026-09-18-koine/03-auth-identity.md) | Better Auth, Google OAuth, sessions, guest identity |
| 04 | [Meetings](2026-09-18-koine/04-meetings.md) | Codes, links, meeting lifecycle, join policy, schema |
| 05 | [Realtime media](2026-09-18-koine/05-realtime-media.md) | LiveKit tokens, tracks, device control, indicators, screen share, 25+ layout |
| 06 | [Translation](2026-09-18-koine/06-translation.md) | Agent worker, channel model, STT/MT/TTS, ducking, captions |
| 07 | [Chat](2026-09-18-koine/07-chat.md) | Data channels, persistence, per-reader translation |
| 08 | [Deployment](2026-09-18-koine/08-deployment.md) | Environments, secrets, observability, cost controls |

Build order is the module order. 01 and 02 unblock everything; 03 and 04 are
independent of 05; 06 depends on 05; 07 depends on 04 and 05.

## Cross-cutting rules

**Types cross the wire once.** Every request and response shape is a Zod schema
in `packages/shared`, imported by both the SPA and the API. No hand-written
duplicate interfaces.

**Trust boundaries get validation and tests.** Meeting codes, join requests and
token minting are validated server-side and covered by tests regardless of what
the client does. A LiveKit token is minted only after the API has confirmed the
caller may join that specific room.

**Dark theme only.** There is no light mode and no theme toggle. Colours are
defined once as CSS custom properties; nothing hardcodes a hex value.

**Errors say what to do.** "Meeting code not found — check the code or ask the
host for the link", not "404".

## Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Translation latency** | A lag past ~2.5 s turns conversation into briefing. Highest risk in the project. | Measure end-to-end before building the UI around it. Budget in [module 06](2026-09-18-koine/06-translation.md). |
| Per-minute cost | Concurrent TTS streams for long meetings are a real bill | Channel-per-language; idle channel shutdown; cost ceiling per meeting |
| Guessable meeting codes | Uninvited join | High-entropy codes, rate-limited lookup — [module 04](2026-09-18-koine/04-meetings.md) |
| Self-hosted SFU operations | Outage takes every meeting down | Multi-node from the start, Redis-coordinated; runbook before real users |
| SFU egress bandwidth | Cost and saturation, not CPU | Simulcast; capacity planned per node in module 08 |
| `backdrop-filter` cost | Frame drops beside 9+ live video elements | Perf switch that drops blur — [module 02](2026-09-18-koine/02-design-system.md) |
| Per-process counters | Rate limits and spend caps multiply by instance count, silently | Redis-backed, specified in modules 04, 06 and 08 |
| Agent worker loss mid-meeting | A live room loses translation | Re-dispatch and channel recovery — [module 06](2026-09-18-koine/06-translation.md) |

## Open items

These do not block planning but must be settled during implementation:

1. Exact OpenAI models and the speech-to-speech versus cascade decision. Resolve
   by measurement, not by reading docs — see module 06.
2. Whether Biome's Tailwind class sorting is stable enough to rely on, or whether
   the project uses Prettier for that one job — see module 01.
3. Guest display names: self-chosen, or derived. See module 03.
