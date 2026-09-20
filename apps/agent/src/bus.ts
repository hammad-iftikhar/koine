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
