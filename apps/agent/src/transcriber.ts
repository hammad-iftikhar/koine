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
      // Before the transcription, not after it. The worker is dispatched to
      // every room in the LiveKit project, so a room where everyone hears the
      // floor language would otherwise call OpenAI's transcription endpoint
      // once per speaker per window to produce a segment with no translations
      // in it — which no client renders and the synthesizer discards. Plan 06
      // is explicit: a room with everyone on the floor language creates zero
      // channels and makes zero OpenAI calls.
      const targets = deps.channels()
      if (targets.length === 0) return

      let original: string
      try {
        original = await deps.client.transcribe(audio, sourceLang)
      } catch (error) {
        // The room continues untranslated. It never stops.
        console.error(`transcriber: stt failed in ${roomId}`, error)
        return
      }

      if (!original.trim()) return

      let translations: Record<string, string> = {}
      try {
        translations = await deps.client.translate(original, sourceLang, targets)
      } catch (error) {
        // Captions still go out with the original. Showing what was said beats
        // showing nothing because the translator was rate limited.
        console.error(`transcriber: translation failed in ${roomId}`, error)
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
