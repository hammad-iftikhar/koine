# Koine — Plan Index

**Spec:** [`../specs/2026-09-18-koine-design.md`](../specs/2026-09-18-koine-design.md)

One plan per spec module. Each produces working, testable software on its own and
is written when its turn comes — not up front, because later modules depend on
measurements that do not exist yet.

| # | Plan | Depends on | Status |
|---|---|---|---|
| 01 | [Foundation](2026-09-18-01-foundation.md) | — | **Written** |
| 02 | Design system | 01 | Not written |
| 03 | Auth & identity | 01 | Not written |
| 04 | Meetings | 01, 03 | Not written |
| 05 | Realtime media | 01, 02, 04 | Not written |
| 06 | Translation | 05 | **Blocked — see below** |
| 07 | Chat | 04, 05 | Not written |
| 08 | Deployment | all | Not written |

## Why 06 is blocked, not merely unwritten

Module 06 names two candidate pipelines — speech-to-speech versus a cascade of
STT, translate and TTS — and instructs that the choice be made by measurement
rather than by reading documentation. It also sets a hard latency ceiling of
2.5 seconds, and states that missing it turns the product from a conversation
into a briefing, which is a product decision rather than an engineering one.

Writing task-by-task steps for 06 now would mean inventing a pipeline around a
number nobody has measured. **Run the latency spike first** — real OpenAI calls,
floor-audio-in to translated-audio-out, recorded in module 06 — then plan 06
against the result.

## What is deliberately not in plan 01

- **Database schema and the Postgres test harness.** Module 01 specifies a real
  Postgres per test run, but the first table arrives in plan 03. Building the
  harness before there is anything to store is scaffolding for its own sake.
- **shadcn/ui component installation.** Added per component in plan 02, not
  bulk-installed up front.
- **Drizzle.** Arrives with the first schema, in plan 03.
