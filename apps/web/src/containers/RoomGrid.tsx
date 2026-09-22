import { useLocalParticipant, useParticipants, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { ParticipantTile } from '@/components/ParticipantTile'
import { ScreenShareTile } from '@/components/ScreenShareTile'
import { type GridEntry, orderTiles } from '@/lib/grid'
import { withoutAgents } from '@/lib/participants'

export function RoomGrid() {
  // Filtered once, at the source: the translation worker is a real LiveKit
  // participant (it has to be, or nobody could subscribe to its tracks), and
  // every tile, mute lookup and count below reads from this one list.
  const participants = withoutAgents(useParticipants())
  const { localParticipant } = useLocalParticipant()

  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true })
  const share = screenTracks[0]

  const entries: GridEntry[] = participants.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    // A muted participant is never shown as speaking, and ordering has to obey
    // the same rule the tile does — otherwise a stale speaking flag on someone
    // muted wins slot 0 while their tile correctly refuses to look like it.
    speaking: p.isSpeaking && p.isMicrophoneEnabled,
    isSelf: p.identity === localParticipant.identity,
  }))

  const { visible, overflow } = orderTiles(entries, share ? 4 : 9)

  // The LiveKit Track itself, not its raw MediaStreamTrack: the tile attaches
  // it so adaptive stream can see how big the tile actually is. Reading
  // `mediaStreamTrack` and wrapping it in our own MediaStream skipped that,
  // and every remote tile got served the publisher's smallest layer.
  const trackFor = (identity: string) =>
    cameraTracks.find((t) => t.participant.identity === identity)?.publication?.track

  const mutedFor = (identity: string) =>
    !participants.find((p) => p.identity === identity)?.isMicrophoneEnabled

  // Not `!trackFor(identity)`: turning the camera off mutes the track, it does
  // not unpublish it, so the publication and its MediaStream survive and the
  // tile would keep showing the last frame the track produced before mute
  // stopped it. `isCameraEnabled` is `!(pub?.isMuted ?? true)`, exactly the
  // shape `mutedFor` uses above — so a participant with no camera publication
  // at all also reads as camera-off, which is what we want to draw.
  const cameraOffFor = (identity: string) =>
    !participants.find((p) => p.identity === identity)?.isCameraEnabled

  return (
    <div className="grid h-full min-h-0 w-full gap-2.5 md:grid-cols-2">
      {share && (
        <div className="md:col-span-2">
          <ScreenShareTile
            presenterName={share.participant.name || share.participant.identity}
            stream={share.publication?.track}
          />
        </div>
      )}

      {visible.map((entry) => (
        <ParticipantTile
          key={entry.identity}
          name={entry.name}
          speaking={entry.speaking}
          muted={mutedFor(entry.identity)}
          cameraOff={cameraOffFor(entry.identity)}
          stream={trackFor(entry.identity)}
          isSelf={entry.isSelf}
        />
      ))}

      {overflow > 0 && (
        <div className="grid place-items-center rounded-[18px] border border-(--edge) bg-(--pane) text-fg-2">
          +{overflow} more
        </div>
      )}
    </div>
  )
}
