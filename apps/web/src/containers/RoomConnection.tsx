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
  onLeave,
  children,
}: {
  credentials: JoinResponse
  micOn: boolean
  cameraOn: boolean
  onLeave: () => void
  children: ReactNode
}) {
  return (
    <LiveKitRoom
      token={credentials.livekitToken}
      serverUrl={credentials.livekitUrl}
      connect
      audio
      video
      onDisconnected={onLeave}
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
