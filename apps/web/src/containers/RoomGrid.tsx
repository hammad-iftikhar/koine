import { useLocalParticipant, useParticipants, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { ParticipantTile } from '../components/ParticipantTile'
import { ScreenShareTile } from '../components/ScreenShareTile'
import { type GridEntry, orderTiles } from '../lib/grid'

export function RoomGrid() {
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()

  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true })
  const share = screenTracks[0]

  const entries: GridEntry[] = participants.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    speaking: p.isSpeaking,
    isSelf: p.identity === localParticipant.identity,
  }))

  const { visible, overflow } = orderTiles(entries, share ? 4 : 9)

  const streamFor = (identity: string) => {
    const pub = cameraTracks.find((t) => t.participant.identity === identity)
    const track = pub?.publication?.track
    return track ? new MediaStream([track.mediaStreamTrack]) : undefined
  }

  const mutedFor = (identity: string) =>
    !participants.find((p) => p.identity === identity)?.isMicrophoneEnabled

  return (
    <div className="grid h-full min-h-0 w-full gap-2.5 md:grid-cols-2">
      {share && (
        <div className="md:col-span-2">
          <ScreenShareTile
            presenterName={share.participant.name || share.participant.identity}
            stream={
              share.publication?.track
                ? new MediaStream([share.publication.track.mediaStreamTrack])
                : undefined
            }
          />
        </div>
      )}

      {visible.map((entry) => (
        <ParticipantTile
          key={entry.identity}
          name={entry.name}
          speaking={entry.speaking}
          muted={mutedFor(entry.identity)}
          cameraOff={!streamFor(entry.identity)}
          stream={streamFor(entry.identity)}
          isSelf={entry.isSelf}
        />
      ))}

      {overflow > 0 && (
        <div className="grid place-items-center rounded-[18px] border border-[var(--edge)] bg-[var(--pane)] text-fg-2">
          +{overflow} more
        </div>
      )}
    </div>
  )
}
