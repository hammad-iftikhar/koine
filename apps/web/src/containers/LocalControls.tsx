import { useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react'
import { type Room, Track } from 'livekit-client'
import { useState } from 'react'
import { ControlBar } from '@/components/ControlBar'

export function LocalControls({
  micOn,
  cameraOn,
  onToggleMic,
  onToggleCamera,
  captions,
  onToggleCaptions,
  onLeave,
}: {
  micOn: boolean
  cameraOn: boolean
  // Room.tsx owns the mic/camera state (it is shared with RoomConnection's
  // reconnect handler), but only this component — inside <LiveKitRoom> — has
  // a real room to act on. So the toggle takes the room at call time instead
  // of the hook binding it once outside the provider.
  onToggleMic: (room: Room | undefined) => Promise<void>
  onToggleCamera: (room: Room | undefined) => Promise<void>
  captions: boolean
  onToggleCaptions: () => void
  onLeave: () => void
}) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [hand, setHand] = useState(false)

  const presenting = localParticipant.isScreenShareEnabled
  // LiveKit does not enforce one screen share per room, and RoomGrid renders
  // screenTracks[0], so a second presenter would be silently invisible.
  const someoneElsePresenting = useTracks([Track.Source.ScreenShare]).length > 0 && !presenting

  return (
    <ControlBar
      mic={micOn}
      camera={cameraOn}
      captions={captions}
      hand={hand}
      presenting={presenting}
      presentDisabled={someoneElsePresenting}
      onToggle={async (control) => {
        if (control === 'mic') await onToggleMic(room)
        else if (control === 'camera') await onToggleCamera(room)
        else if (control === 'captions') onToggleCaptions()
        else if (control === 'hand') setHand((h) => !h)
        else if (control === 'present') {
          // One screen share at a time in v1, enforced here by disabling the
          // control while someone else presents — LiveKit itself does not do
          // this: two participants can both publish a screen-share source, and
          // RoomGrid takes screenTracks[0], so the second presenter vanishes
          // and which one shows can flip with iteration order. The spec's
          // "a second request replaces the first, with a confirmation" is not
          // built; refusing the second request is the honest v1 behaviour.
          await localParticipant.setScreenShareEnabled(!presenting)
        }
      }}
      onLeave={onLeave}
    />
  )
}
