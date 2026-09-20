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
