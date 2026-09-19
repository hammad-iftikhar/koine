import { useConnectionState } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'

export function ConnectionBanner() {
  const state = useConnectionState()
  if (state === ConnectionState.Connected) return null

  // An empty grid with no explanation is how a reconnect looks like a crash.
  const message =
    state === ConnectionState.Reconnecting
      ? 'Reconnecting…'
      : state === ConnectionState.Connecting
        ? 'Joining the meeting…'
        : 'You have been disconnected. Rejoin from the meeting link.'

  return (
    <div
      role="status"
      className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-[var(--edge)] bg-black/70 px-4 py-2 text-[13px] backdrop-blur-[28px]"
    >
      {message}
    </div>
  )
}
