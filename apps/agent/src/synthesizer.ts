import type { CaptionSegment } from '@koine/shared'
import type { createBus } from './bus'
import type { TranslationClient } from './openai'

type Bus = ReturnType<typeof createBus>

export function createSynthesizer(deps: {
  client: TranslationClient
  bus: Bus
  publishAudio: (audio: Buffer, lang: string, roomId: string) => Promise<void>
  spend: { consume(roomId: string, units: number): Promise<boolean> }
  /**
   * Ends every `tr:` track in the room, once, when the ceiling trips.
   *
   * Without it the tracks stay published and silent, and no LiveKit event
   * fires for a track that merely stops carrying audio — so the client keeps
   * the floor ducked under a channel that will never speak again.
   */
  endChannels?: (roomId: string) => Promise<void>
}) {
  return {
    /** Subscribes this room to the bus. Returns a detach function. */
    attach(roomId: string): () => void {
      // The ceiling is per meeting and the counter only grows, so this is a
      // one-way door: end the channels on the first refusal and never again.
      let channelsEnded = false

      return deps.bus.subscribe(roomId, (segment: CaptionSegment) => {
        // Fire-and-forget, but never fire-and-forget an unhandled rejection:
        // that can take down the whole worker process, silencing every other
        // room it serves. Catch belt-and-suspenders on top of the try/catch
        // inside synthesizeAll, in case a future edit adds an awaited call
        // above it that can throw.
        void synthesizeAll(segment).catch((error) => {
          console.error(`synthesizer: unexpected failure in ${roomId}`, error)
        })
      })

      async function synthesizeAll(segment: CaptionSegment) {
        const entries = Object.entries(segment.translations)
        if (entries.length === 0) return

        let within: boolean
        try {
          within = await deps.spend.consume(roomId, segment.original.length * entries.length)
        } catch (error) {
          // Fail closed: a spend you cannot count is not a licence to spend.
          // Captions keep flowing either way; the next segment retries once
          // Redis recovers — which is why the channels are left published
          // here, unlike a real ceiling. A Redis blip is temporary and
          // recoverable; nothing in this worker republishes a track it tore
          // down.
          console.error(`synthesizer: spend check failed in ${roomId}`, error)
          return
        }
        if (!within) {
          // Captions keep flowing; only the voice stops. The room is told by
          // the client, which sees the tr: tracks end — so they have to
          // actually end, here, or the listener sits at a ducked floor volume
          // under a channel that has gone quiet for good.
          console.warn(`synthesizer: spend ceiling reached in ${roomId}, captions only`)
          if (!channelsEnded) {
            channelsEnded = true
            void deps
              .endChannels?.(roomId)
              .catch((error) =>
                console.error(`synthesizer: could not end channels in ${roomId}`, error),
              )
          }
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
