import type { Room } from 'livekit-client'
import { useCallback, useState } from 'react'

export async function applyMicState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(on)
}

export async function applyCameraState(room: Room | undefined, on: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(on)
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
        // room.state at catch time proves nothing — LiveKit may not have
        // noticed a drop yet, so a connection-state check races and loses.
        // The actual rule has no timing in it: never roll a failed *mute*
        // back into live, since that is exactly the silent-unmute this hook
        // exists to prevent. Only a failed unmute (next === true) is safe to
        // revert — reverting it only ever lands back on muted.
        if (next) {
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
        // Same rule as the mic: never roll a failed camera-off back into on.
        if (next) {
          // Only roll back if nothing newer has moved the switch since.
          setCameraOn((cur) => (cur === next ? !next : cur))
        }
      }
    },
    [cameraOn],
  )

  return { micOn, cameraOn, toggleMic, toggleCamera }
}
