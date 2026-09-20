import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { audioFramesFromFile } from '@livekit/agents'
import {
  AudioSource,
  LocalAudioTrack,
  type Room,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node'

/**
 * Everything the worker sends back into the room: one audio track per target
 * language, named `tr:<lang>`.
 *
 * Untested by design — every line is a call into the LiveKit FFI or ffmpeg,
 * so a test here would assert against a mock of the SDK rather than against
 * behaviour. The logic that can be tested (the WAV framing, the windowing)
 * lives in `audio.ts`, which is pure.
 */

/** What the synthesized audio is resampled to before it reaches LiveKit. */
export const TTS_SAMPLE_RATE = 24_000

export function createTranslationTracks(room: Room) {
  // Keyed by language, holding the in-flight publish rather than the settled
  // source: two segments for the same language can arrive together, and two
  // tracks named tr:es would be two half-conversations.
  const sources = new Map<string, Promise<AudioSource>>()

  function sourceFor(lang: string): Promise<AudioSource> {
    const existing = sources.get(lang)
    if (existing) return existing

    const created = (async () => {
      const source = new AudioSource(TTS_SAMPLE_RATE, 1)
      const track = LocalAudioTrack.createAudioTrack(`tr:${lang}`, source)
      await room.localParticipant?.publishTrack(
        track,
        new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
      )
      return source
    })()

    sources.set(lang, created)
    return created
  }

  return {
    /**
     * Plays one synthesized segment on its language's track.
     *
     * `openai.ts` returns whatever OpenAI's speech endpoint encodes (mp3 by
     * default) and LiveKit captures PCM frames, so the bytes go through
     * ffmpeg — the framework's own decoder, which reads a path, hence the
     * temporary file.
     */
    async publish(audio: Buffer, lang: string): Promise<void> {
      const source = await sourceFor(lang)
      const path = join(tmpdir(), `koine-tts-${randomUUID()}`)
      await writeFile(path, audio)

      try {
        const frames = audioFramesFromFile(path, {
          sampleRate: TTS_SAMPLE_RATE,
          numChannels: 1,
        })
        for await (const frame of frames) await source.captureFrame(frame)
      } finally {
        await rm(path, { force: true })
      }
    },

    async close(): Promise<void> {
      const pending = [...sources.values()]
      sources.clear()
      await Promise.allSettled(pending.map(async (source) => (await source).close()))
    },
  }
}
