# 0014. TTS returns raw PCM, not mp3

**Status:** Accepted
**Decided:** module 06 (translation), review round R9 · **Recorded:** 2026-09-20
**Lives in:** `apps/agent/src/openai.ts`, `apps/agent/src/tracks.ts`

## Context

OpenAI's speech endpoint defaults to mp3. These bytes go straight into a LiveKit
`AudioSource`, so mp3 would mean a temp file and an ffmpeg process per utterance
— against a 400 ms synthesis budget.

## Decision

`response_format: 'pcm'`. OpenAI documents this as raw samples at 24 kHz,
16-bit signed, little-endian, single channel, **without a header**.

## Consequences

- No decode step in the hot path.
- Headerless means the bytes carry none of that format information. The
  agreement lives in two places — this call site and `TTS_SAMPLE_RATE` in
  `tracks.ts` — and they have to be changed together. A mismatch does not error;
  it plays back at the wrong speed.
