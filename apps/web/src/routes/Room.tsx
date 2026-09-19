import { JoinResponse, normalizeMeetingCode } from '@koine/shared'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { MeetingInfoBar } from '../components/MeetingInfoBar'
import { type PanelName, PanelToggles } from '../components/PanelToggles'
import { ConnectionBanner } from '../containers/ConnectionBanner'
import { LocalControls } from '../containers/LocalControls'
import { RoomConnection } from '../containers/RoomConnection'
import { RoomGrid } from '../containers/RoomGrid'
import { useElapsed } from '../lib/useElapsed'

export function Room() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [captions, setCaptions] = useState(true)
  const elapsed = useElapsed()

  // Keyed by the normalized code, same as PreJoin writes it — a hyphenated
  // or uppercase code in the URL must not miss the key it just wrote.
  const raw = sessionStorage.getItem(`koine:${normalizeMeetingCode(code) ?? code}`)
  const parsed = raw ? JoinResponse.safeParse(JSON.parse(raw)) : null

  // Arriving here without credentials means a refresh or a shared URL. Send
  // them through pre-join rather than showing a broken room.
  if (!parsed?.success) return <Navigate to={`/j/${code}`} replace />

  return (
    <RoomConnection credentials={parsed.data} onLeave={() => navigate('/')}>
      <div className="grid h-dvh grid-rows-[1fr_auto] bg-ink">
        <div className="relative min-h-0 p-3">
          <ConnectionBanner />
          <RoomGrid />
        </div>

        <div className="grid grid-cols-1 items-center gap-3 px-4 pb-4 pt-2.5 md:grid-cols-[1fr_auto_1fr]">
          <div className="hidden md:block">
            <MeetingInfoBar elapsedSeconds={elapsed} code={code} />
          </div>
          <div className="justify-self-center">
            <LocalControls
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
