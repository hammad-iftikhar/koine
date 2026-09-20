import type { CaptionSegment } from '@koine/shared'
import { languageLabel } from '@koine/shared'
import { useRoomContext } from '@livekit/components-react'
import { type RemoteParticipant, RoomEvent } from 'livekit-client'
import { useEffect, useState } from 'react'
import { CAPTION_DOCK, CaptionBox } from '../components/CaptionBox'
import { decodeCaption } from '../lib/captions'

export function LiveCaptions({ hearLang, enabled }: { hearLang: string; enabled: boolean }) {
  const room = useRoomContext()
  const [segment, setSegment] = useState<CaptionSegment>()

  useEffect(() => {
    // `dataReceived` hands the sending participant along with the payload —
    // undefined only when the packet came from the server itself. The whole
    // accept/refuse decision, sender included, lives in `decodeCaption`.
    const onData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      const next = decodeCaption(payload, participant)
      if (next) setSegment(next)
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  if (!enabled || !segment) return null

  const translated = segment.translations[hearLang]
  if (!translated) return null

  const speaker =
    room.getParticipantByIdentity?.(segment.speakerIdentity)?.name ?? segment.speakerIdentity

  return (
    <div className={CAPTION_DOCK}>
      <CaptionBox
        speaker={speaker}
        original={segment.original}
        translated={translated}
        sourceLang={languageLabel(segment.sourceLang)}
        interim={!segment.final}
      />
    </div>
  )
}
