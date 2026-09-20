import { CaptionSegment, languageLabel } from '@koine/shared'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useEffect, useState } from 'react'
import { CaptionBox } from '../components/CaptionBox'

export function LiveCaptions({ hearLang, enabled }: { hearLang: string; enabled: boolean }) {
  const room = useRoomContext()
  const [segment, setSegment] = useState<CaptionSegment>()

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      // Untrusted input off the wire. A malformed packet must not blank the
      // captions or crash the room — and `safeParse` alone is not enough,
      // because `JSON.parse` throws on bytes that are not JSON at all and
      // this callback runs inside LiveKit's own event emitter. Anything that
      // is not a CaptionSegment (a chat packet, a truncated frame) is
      // dropped, leaving the last good caption on screen.
      let parsed: ReturnType<typeof CaptionSegment.safeParse>
      try {
        parsed = CaptionSegment.safeParse(JSON.parse(new TextDecoder().decode(payload)))
      } catch {
        return
      }
      if (parsed.success) setSegment(parsed.data)
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
    <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2">
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
