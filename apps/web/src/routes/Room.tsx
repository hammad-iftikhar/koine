import { JoinResponse, normalizeMeetingCode } from '@koine/shared'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { MeetingInfoBar } from '../components/MeetingInfoBar'
import { type PanelName, PanelToggles } from '../components/PanelToggles'
import { ConnectionBanner } from '../containers/ConnectionBanner'
import { LiveCaptions } from '../containers/LiveCaptions'
import { LocalControls } from '../containers/LocalControls'
import { RoomConnection } from '../containers/RoomConnection'
import { RoomGrid } from '../containers/RoomGrid'
import { TranslationAudio } from '../containers/TranslationAudio'
import { useElapsed } from '../lib/useElapsed'
import { useLocalDevices } from '../lib/useLocalDevices'

export function Room() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [captions, setCaptions] = useState(true)
  const elapsed = useElapsed()
  // Lifted above <LiveKitRoom> so RoomConnection's reconnect handler and
  // LocalControls read the exact same booleans — what the user last chose,
  // never whatever the server happened to observe.
  const { micOn, cameraOn, toggleMic, toggleCamera } = useLocalDevices()

  // Keyed by the normalized code, same as PreJoin writes it — a hyphenated
  // or uppercase code in the URL must not miss the key it just wrote.
  const raw = sessionStorage.getItem(`koine:${normalizeMeetingCode(code) ?? code}`)
  // sessionStorage is a trust boundary the user can write to: a malformed or
  // truncated value must take the same fallback as a missing one, not throw.
  let parsed: ReturnType<typeof JoinResponse.safeParse> | null = null
  try {
    parsed = raw ? JoinResponse.safeParse(JSON.parse(raw)) : null
  } catch {
    parsed = null
  }

  // Arriving here without credentials means a refresh or a shared URL. Send
  // them through pre-join rather than showing a broken room.
  if (!parsed?.success) return <Navigate to={`/j/${code}`} replace />

  // From the server's copy of the row, not from local state: it is what the
  // join actually recorded, and it is the same value after a refresh.
  const { hearLang } = parsed.data

  return (
    <RoomConnection credentials={parsed.data} micOn={micOn} cameraOn={cameraOn}>
      <TranslationAudio hearLang={hearLang} />
      <div className="grid h-dvh grid-rows-[1fr_auto] bg-ink">
        <div className="relative min-h-0 p-3">
          <ConnectionBanner />
          <RoomGrid />
          <LiveCaptions hearLang={hearLang} enabled={captions} />
        </div>

        <div className="grid grid-cols-1 items-center gap-3 px-4 pb-4 pt-2.5 md:grid-cols-[1fr_auto_1fr]">
          <div className="hidden md:block">
            <MeetingInfoBar elapsedSeconds={elapsed} code={code} />
          </div>
          <div className="justify-self-center">
            <LocalControls
              micOn={micOn}
              cameraOn={cameraOn}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              captions={captions}
              onToggleCaptions={() => setCaptions((c) => !c)}
              onLeave={() => navigate('/')}
            />
          </div>
          <div className="hidden md:block">
            <PanelToggles active={panel} participantCount={0} onOpen={setPanel} />
          </div>
        </div>
      </div>
    </RoomConnection>
  )
}
