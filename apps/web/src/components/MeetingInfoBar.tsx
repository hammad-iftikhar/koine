export type MeetingInfoBarProps = { elapsedSeconds: number; code: string }

/** m:ss under an hour, h:mm:ss over it. */
export function formatElapsed(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * Bottom-left home for elapsed time and meeting code. It floats over the
 * video grid, so its chrome is `.glass` rather than a hand-rolled blur — the
 * one surface that keeps working when the blur performance switch flips off.
 */
export function MeetingInfoBar({ elapsedSeconds, code }: MeetingInfoBarProps) {
  return (
    <div className="glass flex min-w-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-[13.5px] text-fg-2">
      <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
      <span className="tabular-nums truncate text-fg-2">· {code}</span>
    </div>
  )
}
