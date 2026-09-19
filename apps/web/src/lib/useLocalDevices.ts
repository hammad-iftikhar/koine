import { ConnectionState, type Room } from 'livekit-client'
import { useCallback, useState } from 'react'

export async function applyMicState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(on)
}

export async function applyCameraState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(on)
}

// A rejection while the room is not cleanly Connected (mid-reconnect, still
// negotiating, etc.) is exactly the disconnect the user is waiting out, not a
// real device failure — rolling back here would silently reverse what they
// asked for. RestoreDeviceState re-applies local state once the room comes
// back, so trust local state and only roll back a genuine, connected-state
// failure (the device itself refused).
function shouldRollBack(room: Room | undefined): boolean {
  return room?.state === ConnectionState.Connected
}

// Room.tsx owns this state, above <LiveKitRoom>, so RoomConnection's
// reconnect handler and LocalControls read the exact same booleans instead
// of each keeping their own. There is no LiveKit room available up there, so
// the room is threaded through at call time (from LocalControls, which is
// inside <LiveKitRoom>) rather than bound once when the hook is constructed.
export function useLocalDevices(initial = { mic: true, camera: true }) {
  const [micOn, setMicOn] = useState(initial.mic)
  const [cameraOn, setCameraOn] = useState(initial.camera)

  const toggleMic = useCallback(
    async (room: Room | undefined) => {
      const next = !micOn
      // Optimistic: the indicator must move the instant the user clicks, or they
      // click twice and end up back where they started.
      setMicOn(next)
      try {
        await applyMicState(room, next)
      } catch {
        if (shouldRollBack(room)) {
          // Only roll back if nothing newer has moved the switch since.
          setMicOn((cur) => (cur === next ? !next : cur))
        }
      }
    },
    [micOn],
  )

  const toggleCamera = useCallback(
    async (room: Room | undefined) => {
      const next = !cameraOn
      setCameraOn(next)
      try {
        await applyCameraState(room, next)
      } catch {
        if (shouldRollBack(room)) {
          // Only roll back if nothing newer has moved the switch since.
          setCameraOn((cur) => (cur === next ? !next : cur))
        }
      }
    },
    [cameraOn],
  )

  return { micOn, cameraOn, toggleMic, toggleCamera }
}
