import type { JoinResponse } from '@koine/shared'
import { LiveKitRoom, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { type ReactNode, useEffect } from 'react'
import { applyCameraState, applyMicState } from '../lib/useLocalDevices'

function RestoreDeviceState({ micOn, cameraOn }: { micOn: boolean; cameraOn: boolean }) {
  const room = useRoomContext()

  useEffect(() => {
    const restore = () => {
      // From local state, never from what the server last saw. The server's
      // view can be stale by exactly the window that caused the reconnect.
      void applyMicState(room, micOn)
      void applyCameraState(room, cameraOn)
    }
    room.on(RoomEvent.Reconnected, restore)
    return () => {
      room.off(RoomEvent.Reconnected, restore)
    }
  }, [room, micOn, cameraOn])

  return null
}

export function RoomConnection({
  credentials,
  micOn,
  cameraOn,
  children,
}: {
  credentials: JoinResponse
  micOn: boolean
  cameraOn: boolean
  children: ReactNode
}) {
  return (
    <LiveKitRoom
      token={credentials.livekitToken}
      serverUrl={credentials.livekitUrl}
      connect
      audio
      video
      // Deliberately no onDisconnected: routing a drop to onLeave navigates
      // away, so ConnectionBanner's reconnecting and disconnected states could
      // never render on a real drop and the user landed on the home page with
      // no explanation. The explicit Leave button navigates on its own, through
      // ControlBar's onLeave in LocalControls.
      options={{
        // Small tiles do not need full resolution, and on self-hosted
        // infrastructure the egress saving is ours to keep.
        publishDefaults: { simulcast: true },
        adaptiveStream: true,
        dynacast: true,
      }}
    >
      <RestoreDeviceState micOn={micOn} cameraOn={cameraOn} />
      {children}
    </LiveKitRoom>
  )
}
