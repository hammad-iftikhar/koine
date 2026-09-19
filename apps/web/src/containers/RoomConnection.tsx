import type { JoinResponse } from '@koine/shared'
import { LiveKitRoom } from '@livekit/components-react'
import type { ReactNode } from 'react'

export function RoomConnection({
  credentials,
  onLeave,
  children,
}: {
  credentials: JoinResponse
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
      {children}
    </LiveKitRoom>
  )
}
