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
