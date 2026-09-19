import { useEffect, useRef } from 'react'

/**
 * Attaches a `MediaStream` to a `<video>` element's `srcObject`, and clears
 * it on cleanup or when the stream changes. Shared by every component that
 * renders a live video tile (`ParticipantTile`, `ScreenShareTile`,
 * `DevicePreview`) so the attach/detach lifecycle exists in exactly one
 * place.
 */
export function useVideoStream(stream: MediaStream | undefined) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return videoRef
}
