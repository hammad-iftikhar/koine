import { useEffect, useRef } from 'react'

export type ScreenShareTileProps = { presenterName: string; stream?: MediaStream }

export function ScreenShareTile({ presenterName, stream }: ScreenShareTileProps) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div
      data-testid="screen-share-tile"
      className="relative h-full w-full overflow-hidden rounded-[18px] border border-[var(--edge)] bg-[rgba(255,255,255,0.04)]"
    >
      {stream ? (
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center text-fg-2">Waiting for the screen…</div>
      )}
      <span className="glass absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-fg">
        {presenterName} is presenting
      </span>
    </div>
  )
}
