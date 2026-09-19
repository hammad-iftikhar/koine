import { useConnectionState } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'

export function ConnectionBanner() {
  const state = useConnectionState()
  if (state === ConnectionState.Connected) return null

  // An empty grid with no explanation is how a reconnect looks like a crash.
  // A dropped connection passes through SignalReconnecting (resuming the
  // signaling websocket) before, if that fails, escalating to Reconnecting
  // (a full rejoin). Both are "still trying" — only the terminal Disconnected
  // state means the room actually gave up.
  const message =
    state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting
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
