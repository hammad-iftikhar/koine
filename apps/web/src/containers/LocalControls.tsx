import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { useState } from 'react'
import { ControlBar } from '../components/ControlBar'
import { useLocalDevices } from '../lib/useLocalDevices'

export function LocalControls({
  captions,
  onToggleCaptions,
  onLeave,
}: {
  captions: boolean
  onToggleCaptions: () => void
  onLeave: () => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const { micOn, cameraOn, toggleMic, toggleCamera } = useLocalDevices(room)
  const [hand, setHand] = useState(false)

  const presenting = localParticipant.isScreenShareEnabled

  return (
    <ControlBar
      mic={micOn}
      camera={cameraOn}
      captions={captions}
      hand={hand}
      presenting={presenting}
      onToggle={async (control) => {
        if (control === 'mic') await toggleMic()
        else if (control === 'camera') await toggleCamera()
        else if (control === 'captions') onToggleCaptions()
        else if (control === 'hand') setHand((h) => !h)
        else if (control === 'present') {
          // One screen share at a time. Starting a second replaces the first,
          // which LiveKit handles; we only flip our own.
          await localParticipant.setScreenShareEnabled(!presenting)
        }
      }}
      onLeave={onLeave}
    />
  )
}
