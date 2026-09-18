# Koine Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synthesized translated audio plus bilingual captions, one channel per target language, degrading to captions rather than stopping the call.

**Architecture:** An agent worker joins each room hidden, subscribes to the microphone tracks, and publishes one `tr:<lang>` audio track per target language in use. Two roles — transcriber and synthesizer — separated by a `CaptionSegment` message but running in one process in v1. Listeners duck the floor audio client-side.

**Tech Stack:** LiveKit Agents (Node), livekit-client, OpenAI, Drizzle, Redis, Web Audio.

**Spec:** [`../specs/2026-09-18-koine/06-translation.md`](../specs/2026-09-18-koine/06-translation.md)

## Global Constraints

- **Node 22**, pnpm, TypeScript. Test-first.
- **Never call OpenAI from CI**, and never test OpenAI itself. Stub the client.
- **One channel per target language, never per listener.** Cost must not scale with headcount.
- **Translation is an enhancement layer.** Its failure degrades the call; it never stops it.
- **The original stays visible above the translation.** Not negotiable — a translation you cannot audit is one you cannot trust.
- **Channel state is derived from `participant.hearLang` in Postgres**, so a replacement worker rebuilds it without client help.
- **Spend counters and claims live in Redis**, never process memory.
- **Two roles, one process.** Separate them by a message, do not distribute them. Splitting is plan 06's "Splitting later" section, not this plan.
- Dark theme only; colours from tokens.

---

## Task 1: The latency spike — measure before building

**This task is a gate.** The spec names two candidate pipelines and instructs that
the choice be made by measurement. Tasks 2 onwards assume a decision exists.

**Files:**
- Create: `apps/agent/src/spike/latency.ts` (throwaway — deleted in Step 5)
- Modify: `../specs/2026-09-18-koine/06-translation.md` (record the result)

- [ ] **Step 1: Write the measurement harness**

`apps/agent/src/spike/latency.ts`:
```ts
/**
 * THROWAWAY. Deleted at the end of Task 1. Its output is a number and a
 * decision, not code we keep.
 *
 * Measures wall-clock from "audio handed to the pipeline" to "first byte of
 * translated audio returned", for both candidate pipelines, over a fixed
 * sample of recorded speech.
 */
import { readFileSync } from 'node:fs'

type Result = { label: string; firstByteMs: number[]; completeMs: number[] }

const SAMPLES = [
  'fixtures/es-short.wav', // "Se movió la fecha al viernes."
  'fixtures/es-long.wav', // ~15 seconds of continuous speech
]

async function measure(label: string, run: (audio: Buffer) => Promise<{ firstByte: number; complete: number }>): Promise<Result> {
  const firstByteMs: number[] = []
  const completeMs: number[] = []

  for (const path of SAMPLES) {
    const audio = readFileSync(new URL(path, import.meta.url))
    for (let i = 0; i < 5; i++) {
      const { firstByte, complete } = await run(audio)
      firstByteMs.push(firstByte)
      completeMs.push(complete)
    }
  }
  return { label, firstByteMs, completeMs }
}

function report(r: Result) {
  const sorted = [...r.firstByteMs].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.floor(sorted.length * q)] ?? 0
  console.log(`${r.label}: p50 ${p(0.5)}ms  p90 ${p(0.9)}ms  max ${sorted.at(-1)}ms`)
}

// Implement both runners against the current OpenAI SDK. Do not copy model
// names from any document — read the current model list first, and record
// which models were used in the spec alongside the numbers.
const cascade = await measure('cascade (STT → translate → TTS)', async () => {
  throw new Error('implement against the current OpenAI SDK')
})
const speechToSpeech = await measure('speech-to-speech', async () => {
  throw new Error('implement against the current OpenAI SDK')
})

report(cascade)
report(speechToSpeech)
```

- [ ] **Step 2: Record two speech fixtures**

Record or source two Spanish audio files — one short utterance, one about fifteen
seconds of continuous speech — as 16 kHz mono WAV at `apps/agent/src/spike/fixtures/`.
Real speech, not synthesized: TTS output is unnaturally clean and will flatter the
recognition stage.

- [ ] **Step 3: Implement both runners and measure**

Consult the current OpenAI documentation for the available models and the
streaming interfaces. Implement both `measure` callbacks. Run with a real key:

Run: `OPENAI_API_KEY=... pnpm --filter @koine/agent exec tsx src/spike/latency.ts`
Expected: two lines of p50 / p90 / max, for both pipelines.

- [ ] **Step 4: Record the result and decide**

Edit `../specs/2026-09-18-koine/06-translation.md`. Under "Latency budget", replace
the note about measuring with the actual numbers, the models used, and the date.

Then apply the decision rule:

| p90 first byte | Decision |
|---|---|
| **under 1.5 s** | Proceed. Use whichever pipeline measured faster. |
| **1.5 – 2.5 s** | Proceed with the faster pipeline, and note in the spec that the budget is tight. |
| **over 2.5 s** | **Stop and raise it.** The spec says this is a product decision, not an engineering one. The options are captions-only, push-to-talk turn-taking, or accepting a briefing-shaped product. Do not pick one silently. |

The tasks below are written for the **cascade**, because it produces the
transcript that captions need anyway. If speech-to-speech wins on latency,
Task 4 changes shape — a separate transcription call is still needed for
captions — and Task 5 becomes a pass-through rather than a synthesis step.
Nothing else in this plan changes.

- [ ] **Step 5: Delete the spike**

```bash
rm -rf apps/agent/src/spike
git add ../specs/2026-09-18-koine/06-translation.md
git commit -m "docs: record measured translation latency and pipeline decision"
```

A spike's output is an answer. Keeping the code turns a measurement into a
codebase.

---

### Task 2: Channel derivation

Pure logic, no I/O, and the place where a silent bug puts the wrong language in someone's ear.

**Files:**
- Create: `packages/shared/src/channels.ts`, `packages/shared/src/channels.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
```ts
type ChannelInput = { hearLang: string }
function deriveChannels(participants: ChannelInput[], floorLang: string, max?: number): string[]
```
  Returns a sorted array of language codes needing a TTS channel.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/channels.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { deriveChannels } from './channels'

const p = (hearLang: string) => ({ hearLang })

describe('deriveChannels', () => {
  it('needs no channel when everyone hears the floor language', () => {
    expect(deriveChannels([p('en'), p('en'), p('en')], 'en')).toEqual([])
  })

  it('needs no channel for listeners on the raw floor', () => {
    expect(deriveChannels([p('floor'), p('floor')], 'es')).toEqual([])
  })

  it('creates one channel per distinct language, not per listener', () => {
    // The entire cost argument. Twenty-five people, four languages, four channels.
    const room = [
      ...Array.from({ length: 10 }, () => p('en')),
      ...Array.from({ length: 10 }, () => p('ur')),
      ...Array.from({ length: 5 }, () => p('ja')),
    ]
    expect(deriveChannels(room, 'es')).toEqual(['en', 'ja', 'ur'])
  })

  it('excludes the floor language even when someone selected it explicitly', () => {
    expect(deriveChannels([p('es'), p('en')], 'es')).toEqual(['en'])
  })

  it('drops a channel when its last listener leaves', () => {
    expect(deriveChannels([p('en'), p('ur')], 'es')).toEqual(['en', 'ur'])
    expect(deriveChannels([p('en')], 'es')).toEqual(['en'])
  })

  it('returns an empty set for an empty room', () => {
    expect(deriveChannels([], 'en')).toEqual([])
  })

  it('is sorted, so a rebuild after a worker dies produces the same set', () => {
    expect(deriveChannels([p('ur'), p('en'), p('ja')], 'es')).toEqual(['en', 'ja', 'ur'])
  })

  it('caps at the configured maximum rather than exhausting the worker', () => {
    // One pathological meeting must not take down every other room on the box.
    const room = [p('en'), p('es'), p('ur'), p('ja')]
    expect(deriveChannels(room, 'de', 2)).toEqual(['en', 'es'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/shared test channels`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/channels.ts`:
```ts
import { FLOOR } from './languages'

export type ChannelInput = { hearLang: string }

export const MAX_CHANNELS_PER_ROOM = 6

/**
 * The set of languages needing a synthesized audio channel.
 *
 * One channel per language, never per listener — twenty-five people speaking
 * four languages costs four TTS streams, not twenty-five.
 *
 * Sorted so that a replacement worker rebuilding from Postgres produces exactly
 * the same set in the same order as the worker it replaced.
 */
export function deriveChannels(
  participants: ChannelInput[],
  floorLang: string,
  max = MAX_CHANNELS_PER_ROOM,
): string[] {
  const wanted = new Set<string>()

  for (const { hearLang } of participants) {
    if (hearLang === FLOOR) continue
    if (hearLang === floorLang) continue
    wanted.add(hearLang)
  }

  return [...wanted].sort().slice(0, max)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/shared test channels`
Expected: PASS — 8 tests.

- [ ] **Step 5: Export and commit**

Add to `packages/shared/src/index.ts`:
```ts
export { type ChannelInput, MAX_CHANNELS_PER_ROOM, deriveChannels } from './channels'
```

```bash
git add packages/shared
git commit -m "feat(shared): translation channel derivation"
```

---

### Task 3: The caption segment and the in-process bus

The seam. Both roles run in one process; the boundary is a message, not a function call.

**Files:**
- Create: `packages/shared/src/caption.ts`, `apps/agent/src/bus.ts`, `apps/agent/src/bus.test.ts`

**Interfaces:**
- Produces from `@koine/shared`:
```ts
const CaptionSegment: z.ZodType<{
  speakerIdentity: string
  sourceLang: string
  original: string
  translations: Record<string, string>   // language code → translated text
  final: boolean
  at: number
}>
```
- Produces: `createBus()` returning `{ publish(roomId, segment), subscribe(roomId, handler): () => void }`

- [ ] **Step 1: Write the shared type**

`packages/shared/src/caption.ts`:
```ts
import { z } from 'zod'

export const CaptionSegment = z.object({
  speakerIdentity: z.string(),
  sourceLang: z.string(),
  /** What was actually said. Always carried, always rendered above the translation. */
  original: z.string(),
  /** language code → translated text. One entry per active channel. */
  translations: z.record(z.string(), z.string()),
  /** Interim results update the current line; final commits it. */
  final: z.boolean(),
  at: z.number(),
})

export type CaptionSegment = z.infer<typeof CaptionSegment>
```

Add to `packages/shared/src/index.ts`:
```ts
export { CaptionSegment } from './caption'
```

- [ ] **Step 2: Write the failing test**

`apps/agent/src/bus.test.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'

const segment = (over: Partial<CaptionSegment> = {}): CaptionSegment => ({
  speakerIdentity: 'p_1',
  sourceLang: 'es',
  original: 'Hola',
  translations: { en: 'Hello' },
  final: true,
  at: Date.now(),
  ...over,
})

it('delivers to subscribers of the same room', () => {
  const bus = createBus()
  const handler = vi.fn()
  bus.subscribe('room-a', handler)

  bus.publish('room-a', segment())
  expect(handler).toHaveBeenCalledTimes(1)
})

it('does not leak between rooms', () => {
  // One worker serves many rooms. A leak here puts one meeting's words into
  // another meeting's captions.
  const bus = createBus()
  const a = vi.fn()
  const b = vi.fn()
  bus.subscribe('room-a', a)
  bus.subscribe('room-b', b)

  bus.publish('room-a', segment())
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).not.toHaveBeenCalled()
})

it('stops delivering after unsubscribe', () => {
  const bus = createBus()
  const handler = vi.fn()
  const off = bus.subscribe('room-a', handler)

  off()
  bus.publish('room-a', segment())
  expect(handler).not.toHaveBeenCalled()
})

it('one subscriber throwing does not stop the others', () => {
  // A synthesizer failing for one language must not silence every other language.
  const bus = createBus()
  const bad = vi.fn(() => {
    throw new Error('tts exploded')
  })
  const good = vi.fn()
  bus.subscribe('room-a', bad)
  bus.subscribe('room-a', good)

  expect(() => bus.publish('room-a', segment())).not.toThrow()
  expect(good).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @koine/agent test bus`
Expected: FAIL — module missing.

- [ ] **Step 4: Write the implementation**

`apps/agent/src/bus.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'

type Handler = (segment: CaptionSegment) => void

/**
 * The seam between the transcriber and the synthesizer.
 *
 * In-process today. When synthesizers move to their own workers, this becomes
 * the LiveKit data channel — which already carries CaptionSegment for client
 * captions, so there is no new transport to build. See spec module 06,
 * "Splitting later".
 *
 * ponytail: a Map of Sets, not an EventEmitter. Room-scoped keys are the whole
 * requirement, and EventEmitter's max-listener warnings fire at 11 rooms.
 */
export function createBus() {
  const rooms = new Map<string, Set<Handler>>()

  return {
    publish(roomId: string, segment: CaptionSegment): void {
      for (const handler of rooms.get(roomId) ?? []) {
        try {
          handler(segment)
        } catch (error) {
          // One synthesizer failing must not silence the others.
          console.error(`bus: handler failed for room ${roomId}`, error)
        }
      }
    },

    subscribe(roomId: string, handler: Handler): () => void {
      const set = rooms.get(roomId) ?? new Set<Handler>()
      set.add(handler)
      rooms.set(roomId, set)

      return () => {
        set.delete(handler)
        if (set.size === 0) rooms.delete(roomId)
      }
    },
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @koine/agent test bus`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/agent packages/shared
git commit -m "feat(agent): caption segment type and room-scoped bus"
```

---

### Task 4: The transcriber

**Files:**
- Create: `apps/agent/src/openai.ts`, `apps/agent/src/transcriber.ts`, `apps/agent/src/transcriber.test.ts`

**Interfaces:**
- Produces:
```ts
type TranslationClient = {
  transcribe(audio: Buffer, sourceLang: string): Promise<string>
  translate(text: string, from: string, to: string[]): Promise<Record<string, string>>
  synthesize(text: string, lang: string): Promise<Buffer>
}
function createTranscriber(deps: { client: TranslationClient; bus: Bus; channels: () => string[] }): {
  onAudio(roomId: string, speakerIdentity: string, audio: Buffer, sourceLang: string): Promise<void>
}
```
  `TranslationClient` is the seam that keeps OpenAI out of the tests.

- [ ] **Step 1: Write the failing test**

`apps/agent/src/transcriber.test.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'
import { createTranscriber } from './transcriber'

function stubClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    transcribe: vi.fn(async () => 'Se movió la fecha al viernes.'),
    translate: vi.fn(async (_t: string, _f: string, to: string[]) =>
      Object.fromEntries(to.map((lang) => [lang, `[${lang}] The deadline moved to Friday.`])),
    ),
    synthesize: vi.fn(async () => Buffer.alloc(0)),
    ...over,
  }
}

it('publishes a segment carrying the original and every channel translation', async () => {
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient()
  const transcriber = createTranscriber({ client, bus, channels: () => ['en', 'ur'] })
  await transcriber.onAudio('room-a', 'p_1', Buffer.from('audio'), 'es')

  expect(seen).toHaveLength(1)
  expect(seen[0]?.original).toBe('Se movió la fecha al viernes.')
  expect(Object.keys(seen[0]?.translations ?? {}).sort()).toEqual(['en', 'ur'])
  // One translate call for all targets, not one per target.
  expect(client.translate).toHaveBeenCalledTimes(1)
})

it('does not call the translator when no channel is active', async () => {
  // Everyone hears the floor language. Calling OpenAI here is money for nothing.
  const bus = createBus()
  const client = stubClient()
  const transcriber = createTranscriber({ client, bus, channels: () => [] })

  await transcriber.onAudio('room-a', 'p_1', Buffer.from('audio'), 'es')
  expect(client.translate).not.toHaveBeenCalled()
})

it('still publishes captions when translation fails', async () => {
  // Degradation, not silence: the original is always worth showing.
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient({
    translate: vi.fn(async () => {
      throw new Error('rate limited')
    }),
  })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await expect(transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es')).resolves.toBeUndefined()
  expect(seen).toHaveLength(1)
  expect(seen[0]?.original).toBeTruthy()
  expect(seen[0]?.translations).toEqual({})
})

it('publishes nothing when transcription returns empty', async () => {
  const bus = createBus()
  const seen: CaptionSegment[] = []
  bus.subscribe('room-a', (s) => seen.push(s))

  const client = stubClient({ transcribe: vi.fn(async () => '   ') })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es')
  expect(seen).toHaveLength(0)
})

it('swallows a transcription failure rather than killing the room', async () => {
  const bus = createBus()
  const client = stubClient({
    transcribe: vi.fn(async () => {
      throw new Error('stt down')
    }),
  })
  const transcriber = createTranscriber({ client, bus, channels: () => ['en'] })

  await expect(transcriber.onAudio('room-a', 'p_1', Buffer.from('a'), 'es')).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/agent test transcriber`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the client seam**

`apps/agent/src/openai.ts`:
```ts
/**
 * The seam that keeps OpenAI out of every test. The real client is constructed
 * once at startup; tests pass a stub with the same shape.
 *
 * Model names are NOT hardcoded from any document — set them from environment
 * and record the values used in spec module 06 alongside the latency numbers.
 */
export type TranslationClient = {
  transcribe(audio: Buffer, sourceLang: string): Promise<string>
  translate(text: string, from: string, to: string[]): Promise<Record<string, string>>
  synthesize(text: string, lang: string): Promise<Buffer>
}

export function createOpenAIClient(): TranslationClient {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  // Implement against the current OpenAI SDK, using the models chosen by the
  // Task 1 measurement. Translate in ONE call returning all targets — a call
  // per target multiplies cost by language count for no benefit.
  throw new Error('implement against the current OpenAI SDK, using Task 1 models')
}
```

- [ ] **Step 4: Write the transcriber**

`apps/agent/src/transcriber.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'
import type { createBus } from './bus'
import type { TranslationClient } from './openai'

type Bus = ReturnType<typeof createBus>

export function createTranscriber(deps: {
  client: TranslationClient
  bus: Bus
  channels: () => string[]
}) {
  return {
    async onAudio(
      roomId: string,
      speakerIdentity: string,
      audio: Buffer,
      sourceLang: string,
    ): Promise<void> {
      let original: string
      try {
        original = await deps.client.transcribe(audio, sourceLang)
      } catch (error) {
        // The room continues untranslated. It never stops.
        console.error(`transcriber: stt failed in ${roomId}`, error)
        return
      }

      if (!original.trim()) return

      const targets = deps.channels()
      let translations: Record<string, string> = {}

      if (targets.length > 0) {
        try {
          translations = await deps.client.translate(original, sourceLang, targets)
        } catch (error) {
          // Captions still go out with the original. Showing what was said beats
          // showing nothing because the translator was rate limited.
          console.error(`transcriber: translation failed in ${roomId}`, error)
        }
      }

      const segment: CaptionSegment = {
        speakerIdentity,
        sourceLang,
        original,
        translations,
        final: true,
        at: Date.now(),
      }

      deps.bus.publish(roomId, segment)
    },
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @koine/agent test transcriber`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/agent
git commit -m "feat(agent): transcriber with degradation to captions only"
```

---

### Task 5: The synthesizer and the spend ceiling

**Files:**
- Create: `apps/agent/src/synthesizer.ts`, `apps/agent/src/synthesizer.test.ts`, `apps/agent/src/spend.ts`

**Interfaces:**
- Produces: `createSynthesizer({ client, bus, publishAudio, spend })` with `attach(roomId): () => void`
- Produces: `createSpendTracker(redis)` with `consume(roomId, units): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

`apps/agent/src/synthesizer.test.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'
import { expect, it, vi } from 'vitest'
import { createBus } from './bus'
import { createSynthesizer } from './synthesizer'

const segment = (translations: Record<string, string>): CaptionSegment => ({
  speakerIdentity: 'p_1',
  sourceLang: 'es',
  original: 'Se movió la fecha al viernes.',
  translations,
  final: true,
  at: Date.now(),
})

function harness(over: { allowed?: boolean } = {}) {
  const bus = createBus()
  const client = {
    transcribe: vi.fn(),
    translate: vi.fn(),
    synthesize: vi.fn(async () => Buffer.from('audio')),
  }
  const publishAudio = vi.fn(async () => {})
  const spend = { consume: vi.fn(async () => over.allowed ?? true) }
  const synth = createSynthesizer({ client, bus, publishAudio, spend })
  return { bus, client, publishAudio, spend, synth }
}

it('publishes one track per translated language', async () => {
  const h = harness()
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'The deadline moved to Friday.', ur: 'ڈیڈ لائن...' }))
  await vi.waitFor(() => expect(h.publishAudio).toHaveBeenCalledTimes(2))

  expect(h.publishAudio.mock.calls.map((c) => c[1]).sort()).toEqual(['en', 'ur'])
})

it('synthesizes nothing when translation failed', async () => {
  const h = harness()
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({}))
  await new Promise((r) => setTimeout(r, 20))
  expect(h.client.synthesize).not.toHaveBeenCalled()
})

it('stops synthesizing when the spend ceiling is hit', async () => {
  // Degrade to captions rather than run up an unbounded bill.
  const h = harness({ allowed: false })
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'Hello' }))
  await new Promise((r) => setTimeout(r, 20))

  expect(h.client.synthesize).not.toHaveBeenCalled()
  expect(h.publishAudio).not.toHaveBeenCalled()
})

it('one language failing does not stop the others', async () => {
  const h = harness()
  h.client.synthesize = vi.fn(async (_text: string, lang: string) => {
    if (lang === 'en') throw new Error('tts failed')
    return Buffer.from('audio')
  })
  h.synth.attach('room-a')

  h.bus.publish('room-a', segment({ en: 'Hello', ur: 'ہیلو' }))
  await vi.waitFor(() => expect(h.publishAudio).toHaveBeenCalledTimes(1))
  expect(h.publishAudio.mock.calls[0]?.[1]).toBe('ur')
})

it('detaching stops further synthesis', async () => {
  const h = harness()
  const detach = h.synth.attach('room-a')
  detach()

  h.bus.publish('room-a', segment({ en: 'Hello' }))
  await new Promise((r) => setTimeout(r, 20))
  expect(h.client.synthesize).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/agent test synthesizer`
Expected: FAIL — module missing.

- [ ] **Step 3: Install the Redis client in the agent**

The agent does not yet depend on it — plan 04 added it to the API only.

Run: `pnpm --filter @koine/agent add ioredis`

- [ ] **Step 4: Write the spend tracker**

`apps/agent/src/spend.ts`:
```ts
import type Redis from 'ioredis'

export const DEFAULT_CEILING_UNITS = 200_000

/**
 * Per-meeting spend ceiling, counted in Redis with an atomic increment.
 *
 * The agent fleet is multi-process and a room can move between workers, so a
 * counter in process memory is wrong the moment anything restarts.
 */
export function createSpendTracker(redis: Redis, ceiling = DEFAULT_CEILING_UNITS) {
  return {
    async consume(roomId: string, units: number): Promise<boolean> {
      const key = `spend:${roomId}`
      const total = await redis.incrby(key, units)
      // 24h: long enough for any meeting, short enough that the key expires.
      if (total === units) await redis.expire(key, 60 * 60 * 24)
      return total <= ceiling
    },
  }
}
```

- [ ] **Step 5: Write the synthesizer**

`apps/agent/src/synthesizer.ts`:
```ts
import type { CaptionSegment } from '@koine/shared'
import type { createBus } from './bus'
import type { TranslationClient } from './openai'

type Bus = ReturnType<typeof createBus>

export function createSynthesizer(deps: {
  client: TranslationClient
  bus: Bus
  publishAudio: (audio: Buffer, lang: string, roomId: string) => Promise<void>
  spend: { consume(roomId: string, units: number): Promise<boolean> }
}) {
  return {
    /** Subscribes this room to the bus. Returns a detach function. */
    attach(roomId: string): () => void {
      return deps.bus.subscribe(roomId, (segment: CaptionSegment) => {
        void synthesizeAll(segment)
      })

      async function synthesizeAll(segment: CaptionSegment) {
        const entries = Object.entries(segment.translations)
        if (entries.length === 0) return

        const within = await deps.spend.consume(roomId, segment.original.length * entries.length)
        if (!within) {
          // Captions keep flowing; only the voice stops. The room is told
          // by the client, which sees the tr: tracks end.
          console.warn(`synthesizer: spend ceiling reached in ${roomId}, captions only`)
          return
        }

        // Languages are independent. One failing must not silence the rest, so
        // allSettled rather than all.
        await Promise.allSettled(
          entries.map(async ([lang, text]) => {
            try {
              const audio = await deps.client.synthesize(text, lang)
              await deps.publishAudio(audio, lang, roomId)
            } catch (error) {
              console.error(`synthesizer: ${lang} failed in ${roomId}`, error)
            }
          }),
        )
      }
    },
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @koine/agent test synthesizer`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/agent
git commit -m "feat(agent): synthesizer with per-language isolation and spend ceiling"
```

---

### Task 6: The room worker

Wires the roles to a real LiveKit room. This is the task that talks to the network, so it is the last one with logic.

**Files:**
- Create: `apps/agent/src/room.ts`, `apps/agent/src/room.test.ts`
- Modify: `apps/agent/src/main.ts`

**Interfaces:**
- Produces: `createRoomWorker(deps)` with `join(roomCode)` and `leave(roomCode)`
- Consumes: `deriveChannels` (Task 2), `participant` table (plan 04)

- [ ] **Step 1: Write the failing test for channel refresh**

`apps/agent/src/room.test.ts`:
```ts
import { expect, it, vi } from 'vitest'
import { createChannelState } from './room'

it('rebuilds the channel set from the database, not from client state', async () => {
  // This is what makes failover work: a replacement worker asks Postgres, and
  // needs no cooperation from any client.
  const load = vi.fn(async () => ({
    floorLang: 'es',
    participants: [{ hearLang: 'en' }, { hearLang: 'en' }, { hearLang: 'ur' }],
  }))

  const state = createChannelState({ load })
  await state.refresh('room-a')

  expect(state.channels('room-a')).toEqual(['en', 'ur'])
  expect(load).toHaveBeenCalledWith('room-a')
})

it('drops a channel when its last listener leaves', async () => {
  const rosters = [
    { floorLang: 'es', participants: [{ hearLang: 'en' }, { hearLang: 'ur' }] },
    { floorLang: 'es', participants: [{ hearLang: 'en' }] },
  ]
  let call = 0
  const state = createChannelState({ load: async () => rosters[call++] as never })

  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en', 'ur'])

  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en'])
})

it('returns an empty set for a room it has never seen', () => {
  const state = createChannelState({ load: vi.fn() as never })
  expect(state.channels('unknown')).toEqual([])
})

it('keeps the previous set when a refresh fails', async () => {
  // A transient database blip must not silence a working room.
  const state = createChannelState({
    load: vi
      .fn()
      .mockResolvedValueOnce({ floorLang: 'es', participants: [{ hearLang: 'en' }] })
      .mockRejectedValueOnce(new Error('db down')),
  })

  await state.refresh('room-a')
  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/agent test room`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the channel state**

`apps/agent/src/room.ts`:
```ts
import { deriveChannels } from '@koine/shared'

export type Roster = { floorLang: string; participants: { hearLang: string }[] }

/**
 * The channel set per room, rebuilt from Postgres.
 *
 * Deliberately not fed by client events: after a worker dies, its replacement
 * must reconstruct the same set with no client cooperation. The database is the
 * only source that survives the worker.
 */
export function createChannelState(deps: { load: (roomCode: string) => Promise<Roster> }) {
  const byRoom = new Map<string, string[]>()

  return {
    async refresh(roomCode: string): Promise<void> {
      try {
        const roster = await deps.load(roomCode)
        byRoom.set(roomCode, deriveChannels(roster.participants, roster.floorLang))
      } catch (error) {
        // Keep the previous set. A transient blip must not silence a live room.
        console.error(`room: channel refresh failed for ${roomCode}`, error)
      }
    },

    channels(roomCode: string): string[] {
      return byRoom.get(roomCode) ?? []
    },

    forget(roomCode: string): void {
      byRoom.delete(roomCode)
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/agent test room`
Expected: PASS — 4 tests.

- [ ] **Step 5: Wire the worker entrypoint**

Replace `apps/agent/src/main.ts` with the composition root: build the OpenAI
client, the bus, the channel state (loading rosters from Postgres by joining
`meeting` and `participant` on `meeting.code`), the transcriber and the
synthesizer. Register with LiveKit Agents so rooms are dispatched to this worker,
and on each dispatch:

1. Mint a hidden token (`mintAccessToken` with `hidden: true`, plan 04 Task 3) and join.
2. `await channelState.refresh(roomCode)`, then refresh again on every
   participant connect and disconnect event.
3. Subscribe to microphone tracks; feed audio frames to `transcriber.onAudio`.
4. `synthesizer.attach(roomCode)`, publishing each language's audio as a track
   named `tr:<lang>`.
5. On the room emptying: `synthesizer` detach, `channelState.forget`, leave.

Keep this file a composition root — no logic. Everything testable already lives
in Tasks 2 through 6 and is tested there.

- [ ] **Step 6: Verify end to end by hand**

Start the stack, join from two browsers with different `hearLang`, and speak.
Expected: captions appear showing the original above the translation, and the
listener whose `hearLang` differs from the floor hears a synthesized voice.

Record the observed end-to-end latency in spec module 06 next to the Task 1
numbers — the spike measured the pipeline, this measures the product.

- [ ] **Step 7: Commit**

```bash
git add apps/agent
git commit -m "feat(agent): room worker joining, refreshing channels and publishing tracks"
```

---

### Task 7: Client-side captions and ducking

**Files:**
- Create: `apps/web/src/lib/ducking.ts`, `apps/web/src/lib/ducking.test.ts`
- Create: `apps/web/src/containers/LiveCaptions.tsx`, `apps/web/src/containers/TranslationAudio.tsx`
- Modify: `apps/web/src/routes/Room.tsx`

**Interfaces:**
- Produces: `createDucker(context: AudioContext)` with `attachFloor(track)`, `setDucked(on)`
- Produces: `<LiveCaptions />` rendering plan 02's `CaptionBox`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/ducking.test.ts`:
```ts
import { expect, it, vi } from 'vitest'
import { DUCK_GAIN, createDucker } from './ducking'

function fakeContext() {
  const gain = { gain: { value: 1 } }
  return {
    createGain: vi.fn(() => gain),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    destination: {},
    gain,
  }
}

it('ducks the floor to the configured gain, not to silence', () => {
  // Muting the original entirely feels wrong: people take tone and turn-taking
  // from it even when they cannot parse the words.
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)

  ducker.setDucked(true)
  expect(ctx.gain.gain.value).toBe(DUCK_GAIN)
  expect(DUCK_GAIN).toBeGreaterThan(0)
})

it('restores full gain when translation stops', () => {
  // If the agent dies, the listener must hear the room again immediately.
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)

  ducker.setDucked(true)
  ducker.setDucked(false)
  expect(ctx.gain.gain.value).toBe(1)
})

it('is idempotent', () => {
  const ctx = fakeContext()
  const ducker = createDucker(ctx as never)
  ducker.setDucked(true)
  ducker.setDucked(true)
  expect(ctx.gain.gain.value).toBe(DUCK_GAIN)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @koine/web test ducking`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/ducking.ts`:
```ts
/**
 * How loud the original stays underneath the translated voice.
 *
 * A tunable constant, not a magic number: it is the same convention as
 * simultaneous interpretation, and it becomes a user setting for free.
 */
export const DUCK_GAIN = 0.2

export function createDucker(context: AudioContext) {
  const gain = context.createGain()
  gain.gain.value = 1
  gain.connect(context.destination)

  return {
    attachFloor(stream: MediaStream): void {
      context.createMediaStreamSource(stream).connect(gain)
    },
    setDucked(on: boolean): void {
      gain.gain.value = on ? DUCK_GAIN : 1
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @koine/web test ducking`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the captions container**

`apps/web/src/containers/LiveCaptions.tsx`:
```tsx
import { CaptionSegment } from '@koine/shared'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useEffect, useState } from 'react'
import { CaptionBox } from '../components/CaptionBox'
import { languageLabel } from '@koine/shared'

export function LiveCaptions({ hearLang, enabled }: { hearLang: string; enabled: boolean }) {
  const room = useRoomContext()
  const [segment, setSegment] = useState<CaptionSegment>()

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      const parsed = CaptionSegment.safeParse(JSON.parse(new TextDecoder().decode(payload)))
      // Untrusted input off the wire. A malformed packet must not blank the
      // captions or crash the room.
      if (parsed.success) setSegment(parsed.data)
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  if (!enabled || !segment) return null

  const translated = segment.translations[hearLang]
  if (!translated) return null

  const speaker =
    room.getParticipantByIdentity?.(segment.speakerIdentity)?.name ?? segment.speakerIdentity

  return (
    <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2">
      <CaptionBox
        speaker={speaker}
        original={segment.original}
        translated={translated}
        sourceLang={languageLabel(segment.sourceLang)}
        interim={!segment.final}
      />
    </div>
  )
}
```

- [ ] **Step 6: Wire both into the Room route**

In `apps/web/src/routes/Room.tsx`, read `hearLang` from the stored `JoinResponse`,
render `<LiveCaptions hearLang={hearLang} enabled={captions} />` inside the stage,
and mount `TranslationAudio`, which subscribes only to the `tr:<hearLang>` track,
unsubscribes every other `tr:` track, and calls `setDucked(true)` while that track
is playing and `setDucked(false)` when it ends.

**Selective subscription is not an optimisation here.** Without it, twenty-five
clients each pull every language channel and the channel model's entire bandwidth
saving is lost — on self-hosted infrastructure that egress is yours to pay for.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): live captions and floor ducking"
```

---

## Done when

- [ ] Measured end-to-end latency is recorded in spec module 06 with the models used
- [ ] Two participants with different `hearLang` each receive the correct channel
- [ ] Captions show the original above the translation
- [ ] Killing the agent leaves a working untranslated call with floor audio at full gain
- [ ] A room with everyone on the floor language creates zero channels and makes zero OpenAI calls
- [ ] Hitting the spend ceiling degrades to captions rather than stopping the meeting

## Deferred, deliberately

**Splitting the synthesizer onto its own workers.** The trigger is a real meeting
hitting `MAX_CHANNELS_PER_ROOM` *and* measurement showing synthesis is the binding
constraint. What it then takes is in spec module 06 under "Splitting later": a
Redis `SET NX` claim per `(room, language)`, publishing gated on currently holding
the claim, and a second failover path. The `bus` seam from Task 3 is what makes
that a deployment change rather than a rewrite.
