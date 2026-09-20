# 06 — Translation

The hardest module and the reason the product exists. Synthesized translated
audio plus bilingual captions.

## The channel model

The naive implementation runs one pipeline per listener. Twenty-five people means
twenty-five pipelines and a bill that grows with the room.

Instead: **one channel per target language.**

```
floor audio (all mic tracks)
        │
        ▼
   ┌─────────┐
   │  agent  │──▶ tr:en  ──▶ subscribed by everyone whose hear_lang is 'en'
   └─────────┘──▶ tr:es  ──▶ …
              ──▶ tr:ur  ──▶ …
```

Twenty-five people speaking four languages costs four TTS streams. Cost is a
function of language diversity, not headcount.

The channel set is derived from the `participant.hear_lang` column (module 04):

```
channels = distinct(hear_lang) − {'floor'} − {meeting.floor_lang}
```

A channel is created when the first participant selects it and torn down when the
last one leaves it. This is the single most important cost control in the project.

## The agent

A LiveKit Agents worker in Node. It joins each live room as a hidden participant
with its own identity (module 05), subscribes to every microphone track, and
publishes one audio track per channel named `tr:<lang>`.

One worker process handles many rooms. Rooms are assigned by the LiveKit agent
dispatch mechanism; the worker does not poll the API for active meetings.

**Workers scale horizontally.** Add worker processes and the dispatcher spreads
rooms across them; no coordination code is written by this project. The unit of
work is a room, and rooms are independent.

**A room does not split across workers in v1.** Every channel for one meeting runs
on one machine, so a meeting with eight active languages runs eight synthesis
pipelines in one process. Size workers by expected languages per room, not by
expected participants, and cap the channels per room with a configured ceiling
that degrades to captions rather than exhausting the process.

## Two roles, one process

The agent does two jobs with very different costs:

| Role | Work | Cost |
|---|---|---|
| **Transcriber** | Subscribe to mic tracks, STT, translate to text | One stream per room, whatever the language count |
| **Synthesizer** | TTS, publish a `tr:<lang>` track | One pipeline **per language** |

**v1 runs both roles in one process, separated by a message rather than a function
call.** The transcriber emits a `CaptionSegment`; the synthesizer consumes it and
synthesizes the languages it owns.

```ts
// transcriber, when a segment is ready
bus.publish(roomId, segment)

// synthesizer, for the languages it owns
bus.subscribe(roomId, seg => synthesize(seg))
```

`bus` is an in-process emitter today. It becomes the LiveKit data channel when the
roles are split — and that channel already exists, because the transcriber
broadcasts `CaptionSegment` for client captions regardless. The seam is not a new
transport; it is declining to bypass one that is already there.

**Why build the seam and not the split.** The expensive-to-retrofit part is
untangling two roles that grew up sharing process state and assuming they always
would. That costs almost nothing to avoid now. The cheap-to-defer part is
distribution, and deferring it avoids writing claim-and-heartbeat logic that cannot
yet be tested against real load — code that looks correct and fails under
conditions nobody simulated.

There is also nothing to size against yet: whether the ceiling is TTS throughput,
OpenAI rate limits or bandwidth is unknown, and only one of those is fixed by
adding workers.

### Splitting later

Trigger: a real meeting hits the per-room channel ceiling, **and** measurement
shows synthesis is the binding constraint.

What it then takes — a deployment change plus coordination, not a rewrite:

- Run the synthesizer role as its own process, behind a flag
- A **claim per `(room, language)`** in Redis (`SET NX` with a TTL), renewed by
  heartbeat and released on exit
- Publishing gated on *currently* holding the claim, re-checked on renewal — two
  workers publishing `tr:en` into one room means duplicate audio on one track name
- A second failover path: losing the transcriber costs the room its translation;
  losing a synthesizer costs one language. Different blast radius, different recovery.

Until then the diagram's two boxes are two modules in one process.

## Pipeline

Two candidate implementations. **Choose by measurement, not by reading docs.**

**A — Speech to speech.** Floor audio into OpenAI's realtime speech-to-speech
path, translated audio out. Fewer moving parts, lower expected latency, less
control over the intermediate text.

**B — Cascade.** Streaming STT → translation → TTS. More control, gives you the
transcript for free (which captions need anyway), more latency from three hops.

Captions need the source text regardless, so B produces something A must be made
to produce separately. That is a real factor in the choice, not a tiebreaker.

Model selection is deliberately not fixed in this spec. Verify current OpenAI
model names, capabilities and pricing at implementation time rather than
inheriting a name from a document written earlier.

## Latency budget

| Stage | Target |
|---|---|
| Capture → agent | < 150 ms |
| Recognition (partial) | < 400 ms |
| Translation | < 300 ms |
| Synthesis first byte | < 400 ms |
| Agent → listener | < 150 ms |
| **End to end** | **< 1.5 s, hard ceiling 2.5 s** |

Past the 2.5 s ceiling the product stops being a conversation and becomes a
briefing, and the UI — which assumes people respond to each other — is wrong.

**This is the highest risk in the project.** Measure it with real API calls before
building UI on top of it. If the ceiling cannot be met, the options are: captions
only, push-to-talk turn-taking, or accepting a briefing-shaped product. All three
are product decisions, not engineering ones, and they must be raised rather than
absorbed.

### Measurement outcome

The latency measurement was not run. The OpenAI API key was not available at implementation time, and real recorded Spanish speech fixtures were not sourced; synthesized speech would not reflect actual recognition latency and would flatter the performance of the recognition stage.

The implementation therefore proceeds with the cascade pipeline. The plan is written for cascade; it produces the transcript that captions need anyway. This is a default chosen in the absence of a measurement, not a result of one.

When the spike is finally run with a key and real fixtures, apply this decision rule:

| p90 first byte | Decision |
|---|---|
| under 1.5 s | Proceed. Use whichever pipeline measured faster. |
| 1.5 – 2.5 s | Proceed with the faster pipeline, note that the budget is tight. |
| over 2.5 s | Stop and raise it. The options are captions-only, push-to-talk turn-taking, or accepting a briefing-shaped product. This is a product decision, not an engineering one. |

Record the OpenAI models used (`OPENAI_STT_MODEL`, `OPENAI_TRANSLATE_MODEL`, `OPENAI_TTS_MODEL`) alongside the latency numbers when the measurement runs. Until then, the models in use are whatever those environment variables are set to.

## Mixing at the listener

The listener hears the translated voice at full level with the original floor
audio ducked to roughly 20% underneath — the same as simultaneous interpretation.
People take tone, emphasis and turn-taking from the original even when they cannot
parse the words; muting it entirely feels wrong.

Ducking is done client-side with a Web Audio `GainNode` on the floor tracks. No
server-side mixing: it is less code, and the ratio becomes a user setting for free.

The duck ratio is a tunable constant, not a magic number buried in a component.

## Captions

The agent broadcasts each segment over a LiveKit reliable data channel:

```ts
type CaptionSegment = {
  speakerIdentity: string
  sourceLang: string
  original: string                        // what was actually said
  translations: Record<string, string>    // language code -> text, one entry per active channel
  final: boolean                          // interim results update in place
  at: number
}
```

One broadcast carries every active language; each client renders the entry matching
its own `hear_lang` and ignores the rest. A packet per language would multiply
data-channel traffic by the language count for no benefit. Interim results update
the current line; final results commit it.

A client whose language is absent from `translations` shows nothing rather than
falling back to another language — silence is honest, the wrong language is not.

**The original stays visible above the translation.** This is a product decision,
not a layout accident: a translation you cannot audit is a translation you cannot
trust, and it costs one line.

## Failure behaviour

| Failure | Behaviour |
|---|---|
| TTS fails or is slow | Captions continue. Audio channel degrades, the meeting does not stop. |
| STT fails | Channel shows "translation unavailable"; floor audio un-ducks to full. |
| Agent crashes | Room continues as an untranslated call. Clients show the degraded state. |
| OpenAI rate limit | Back off, surface the degraded state, do not retry in a tight loop. |

Translation is an enhancement layer. Its failure must never take down the call.

## Cost controls

- Channels created on demand, torn down when unused
- Agent leaves when the room empties
- Per-meeting spend ceiling, counted in **Redis with an atomic increment**. The
  agent fleet is multi-process, so a counter in process memory is wrong the moment
  anything restarts or a second worker picks up the room.
- A configured maximum channel count per room, so one pathological meeting cannot
  exhaust a worker
- Silence detection so an idle room is not paying for a live pipeline

## Agent failover

A worker holds live state for its rooms: the channel set, the pipelines, the
subscriptions. Losing one must not lose the meeting.

**On worker loss:**

1. The room continues as an untranslated call. Floor audio un-ducks to full and
   clients show the degraded state. The meeting never stops.
2. LiveKit dispatches the room to another available worker. **Verify the actual
   re-dispatch behaviour on worker failure before relying on it** — if it does not
   happen automatically, the agent registers a heartbeat per room in Redis and a
   worker claims any room whose heartbeat has expired.
3. The replacement worker rebuilds the channel set from `participant.hear_lang`
   in Postgres, which is why that column is stored rather than held in client
   state (module 04). Recovery needs no client cooperation.
4. Clients re-subscribe when the new `tr:<lang>` tracks are published. In-flight
   caption segments are lost; nothing is replayed.

The gap is audible — a few seconds of untranslated floor audio. That is the
correct trade: a meeting that continues imperfectly beats one that stalls waiting
for recovery.

**Channel state in Redis**, keyed by room: the active channel set and the spend
counter. This is recovery state, not a data store — it is rebuildable from
Postgres and may be lost without correctness impact.

## Tests

- **Failover** — kill a worker mid-room; assert the room continues untranslated,
  a replacement rebuilds the same channel set from the database, and clients
  re-subscribe. This is the test that proves horizontal agent scaling is real
  rather than assumed.
- **Channel ceiling** — a room requesting more channels than the configured
  maximum degrades to captions instead of spawning them
- **Channel derivation** — pure function, no I/O. Given a participant roster,
  assert the exact channel set. Includes: everyone on floor language produces zero
  channels; a leaver removes the last channel; `hear_lang: 'floor'` never creates
  one. This is where a silent bug puts the wrong language in someone's ear.
- **Pipeline glue** — recorded audio fixture, stubbed OpenAI client, assert the
  transcript and translation are handed off in the right shape. Tests the glue,
  not the model.
- **Degradation** — stub TTS failure, assert captions keep flowing and floor audio
  un-ducks.
- **Ducking** — assert the gain node reaches the configured ratio when a
  translation track is active and returns to 1 when it stops.

OpenAI is never called from CI.

## Done when

- Two participants with different `hear_lang` each receive the correct channel
- Measured end-to-end latency is recorded in this document
- Captions show original above translation, updating on interim results
- Killing the agent leaves a working untranslated call
