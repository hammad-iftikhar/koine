import { useCallback } from 'react'

/**
 * Returns a callback ref that attaches a `MediaStream` to a `<video>`
 * element's `srcObject`. Shared by every component that renders a live video
 * tile (`ParticipantTile`, `ScreenShareTile`, `DevicePreview`) so the attach
 * lifecycle exists in exactly one place.
 *
 * A callback ref, not a `useRef` + `useEffect` keyed on `[stream]`: several
 * callers render the `<video>` conditionally against a *different* element
 * type (an avatar span, a "camera is off" paragraph). Toggling that
 * condition unmounts the old `<video>` and mounts a fresh one while `stream`
 * itself stays the same object — an effect keyed on `[stream]` would never
 * re-run, so the new element's `srcObject` would never get set. A callback
 * ref re-attaches on every element change, not just every stream change.
 */
export function useVideoStream(stream: MediaStream | undefined) {
  return useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && stream) el.srcObject = stream
    },
    [stream],
  )
}
