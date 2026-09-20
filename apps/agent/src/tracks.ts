import { AudioByteStream } from '@livekit/agents'
import {
  AudioSource,
  LocalAudioTrack,
  type Room,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node'

/**
 * Everything the worker sends back into the room as audio: one track per
 * target language, named `tr:<lang>`.
 *
 * Untested by design — every line is a call into the LiveKit FFI, so a test
 * here would assert against a mock of the SDK rather than against behaviour.
 * The logic that can be tested (the WAV framing, the windowing, the ingest
 * policy) lives in `audio.ts` and `ingest.ts`, which are pure.
 */

/**
 * The format `openai.ts` asks OpenAI's speech endpoint for: 24 kHz, mono,
 * 16-bit signed little-endian, headerless. Nothing in the bytes says so, so
 * this constant and the comment on `response_format: 'pcm'` are the contract.
 */
export const TTS_SAMPLE_RATE = 24_000
const TTS_CHANNELS = 1

export function createTranslationTracks(room: Room) {
  // Keyed by language, holding the in-flight publish rather than the settled
  // source: two segments for the same language can arrive together, and two
  // tracks named tr:es would be two half-conversations.
  const sources = new Map<string, Promise<AudioSource>>()
  // Also keyed by language: the tail of that language's playback chain. One
  // source plays one thing at a time, so two overlapping utterances must
  // queue rather than interleave their frames into gibberish.
  const playing = new Map<string, Promise<void>>()

  function sourceFor(lang: string): Promise<AudioSource> {
    const existing = sources.get(lang)
    if (existing) return existing

    const created = (async () => {
      const local = room.localParticipant
      // Publishing before the room is connected would hand back a source
      // that swallows audio into a track nobody ever sees.
      if (!local) throw new Error(`tracks: cannot publish tr:${lang}, room is not connected`)

      const source = new AudioSource(TTS_SAMPLE_RATE, TTS_CHANNELS)
      const track = LocalAudioTrack.createAudioTrack(`tr:${lang}`, source)
      await local.publishTrack(
        track,
        new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
      )
      return source
    })()

    sources.set(lang, created)
    // A transient publish failure must not cache itself: without this, every
    // later segment in this language re-awaits the same rejection forever.
    created.catch(() => {
      if (sources.get(lang) === created) sources.delete(lang)
    })

    return created
  }

  async function play(audio: Buffer, lang: string): Promise<void> {
    const source = await sourceFor(lang)
    const stream = new AudioByteStream(TTS_SAMPLE_RATE, TTS_CHANNELS)
    for (const frame of stream.write(audio)) await source.captureFrame(frame)
    for (const frame of stream.flush()) await source.captureFrame(frame)
  }

  return {
    /** Plays one synthesized segment, after anything already queued for its language. */
    publish(audio: Buffer, lang: string): Promise<void> {
      const queued = (playing.get(lang) ?? Promise.resolve()).then(() => play(audio, lang))
      // The chain keeps going after a failure; the caller still sees this one reject.
      playing.set(
        lang,
        queued.catch(() => {}),
      )
      return queued
    },

    async close(): Promise<void> {
      const pending = [...sources.values()]
      sources.clear()
      playing.clear()
      await Promise.allSettled(pending.map(async (source) => (await source).close()))
    },
  }
}
