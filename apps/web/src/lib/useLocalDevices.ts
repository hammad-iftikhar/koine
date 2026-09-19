import type { Room } from 'livekit-client'
import { useCallback, useState } from 'react'

export async function applyMicState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(on)
}

export async function applyCameraState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(on)
}

export function useLocalDevices(room: Room | undefined, initial = { mic: true, camera: true }) {
  const [micOn, setMicOn] = useState(initial.mic)
  const [cameraOn, setCameraOn] = useState(initial.camera)

  const toggleMic = useCallback(async () => {
    const next = !micOn
    // Optimistic: the indicator must move the instant the user clicks, or they
    // click twice and end up back where they started.
    setMicOn(next)
    try {
      await applyMicState(room, next)
    } catch {
      // Only roll back if nothing newer has moved the switch since.
      setMicOn((cur) => (cur === next ? !next : cur))
    }
  }, [room, micOn])

  const toggleCamera = useCallback(async () => {
    const next = !cameraOn
    setCameraOn(next)
    try {
      await applyCameraState(room, next)
    } catch {
      // Only roll back if nothing newer has moved the switch since.
      setCameraOn((cur) => (cur === next ? !next : cur))
    }
  }, [room, cameraOn])

  return { micOn, cameraOn, toggleMic, toggleCamera }
}
