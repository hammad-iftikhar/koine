import type { Track } from 'livekit-client'
import { useCallback } from 'react'

/**
 * Returns a callback ref that puts a video source on a `<video>` element.
 * Shared by every component that renders a live video tile
 * (`ParticipantTile`, `ScreenShareTile`, `DevicePreview`) so the attach
 * lifecycle exists in exactly one place.
 *
 * A LiveKit `Track` must go through `track.attach(el)`, not `srcObject`.
 * Adaptive stream decides which simulcast layer to pull from the size and
 * visibility of the elements the track is *attached* to; a track nobody
 * attached reports 0x0 and gets the smallest layer the publisher sends —
 * which is exactly how every remote tile ended up looking soft. A raw
 * `MediaStream` (pre-join preview, Storybook) still gets `srcObject`.
 *
 * A callback ref, not a `useRef` + `useEffect` keyed on `[source]`: several
 * callers render the `<video>` conditionally against a *different* element
 * type (an avatar span, a "camera is off" paragraph). Toggling that
 * condition unmounts the old `<video>` and mounts a fresh one while `source`
 * itself stays the same object — an effect keyed on `[source]` would never
 * re-run, so the new element would never get attached. A callback ref
 * re-attaches on every element change, not just every source change.
 */
export function useVideoStream(source: MediaStream | Track | undefined) {
  return useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || !source) return
      if (source instanceof MediaStream) {
        el.srcObject = source
        return
      }
      source.attach(el)
      // React 19 cleanup: detaching stops the resize/visibility observers with
      // the element, so a torn-down tile no longer votes on stream quality.
      return () => {
        source.detach(el)
      }
    },
    [source],
  )
}
