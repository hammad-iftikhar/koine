import { MicOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'
import { SpeakingBars } from './SpeakingBars'

export type ParticipantTileProps = {
  name: string
  speaking?: boolean
  muted?: boolean
  cameraOff?: boolean
  stream?: MediaStream
  isSelf?: boolean
}

export function ParticipantTile({
  name,
  speaking = false,
  muted = false,
  cameraOff = false,
  stream,
  isSelf = false,
}: ParticipantTileProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  // A muted participant is never shown as speaking. The detector can lag the
  // toggle, and "you are being heard" is the wrong thing to get wrong.
  const isSpeaking = speaking && !muted
  const label = isSelf ? 'You' : name

  return (
    <div
      data-testid="participant-tile"
      data-speaking={String(isSpeaking)}
      className={cn(
        'relative grid h-full w-full place-items-center overflow-hidden rounded-[18px] border bg-white/5',
        isSpeaking
          ? 'border-blue shadow-[0_0_0_1px_var(--blue),0_0_32px_-10px_var(--blue)]'
          : 'border-[var(--edge)]',
      )}
    >
      {stream && !cameraOff ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted={isSelf}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          data-testid="avatar"
          className="grid h-14 w-14 place-items-center rounded-full bg-blue text-[19px] font-semibold text-white"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <span className="glass absolute bottom-2.5 left-2.5 flex items-center gap-[7px] rounded-full px-2.5 py-1 text-[12.5px] text-fg">
        {isSpeaking && <SpeakingBars active />}
        {label}
      </span>

      {muted && (
        <span
          aria-label="Microphone off"
          role="img"
          className="glass absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-red"
        >
          <MicOff size={14} aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
