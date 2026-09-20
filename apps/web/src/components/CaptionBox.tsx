import { Globe } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Where the caption box sits on the stage.
 *
 * Exported so `LiveCaptions` and the story that measures it cannot drift
 * apart, because the width only works if the dock cooperates. `CaptionBox` is
 * `w-[min(640px,92%)]`, and a percentage resolves against the containing
 * block the dock leaves it: an absolutely positioned box with neither a width
 * nor a `right` is shrink-to-fit, and centring it with `left-1/2` gives it
 * half the stage to be 92% of — so it can never reach 640px and a long
 * caption wraps into a narrow column. Spanning the stage and centring with
 * flex gives the box the full width to resolve against.
 */
export const CAPTION_DOCK = 'absolute inset-x-0 bottom-3.5 flex justify-center'

export type CaptionBoxProps = {
  speaker: string
  original: string
  translated: string
  /** Display name of the source language, e.g. 'Spanish'. */
  sourceLang: string
  interim?: boolean
}

/**
 * The room's live caption surface — the one deliberate departure from Meet:
 * the original utterance stays visible above its translation, so a
 * translation you cannot audit is never one you are asked to just trust.
 *
 * Purely presentational: plan 05's `LiveCaptions` container feeds these
 * props from a data channel. `aria-live="polite"` rather than `assertive` —
 * captions update constantly, and an assertive region would interrupt a
 * screen reader on every word. `aria-atomic` so an interim update reads back
 * as the whole caption, not just whatever text happened to change.
 */
export function CaptionBox({
  speaker,
  original,
  translated,
  sourceLang,
  interim = false,
}: CaptionBoxProps) {
  return (
    <section
      data-testid="caption-box"
      data-interim={String(interim)}
      aria-label="Live caption"
      aria-live="polite"
      aria-atomic="true"
      className="glass-dark mx-auto w-[min(640px,92%)] rounded-[18px] px-[18px] py-3.5"
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-fg-2">
        <Globe size={14} aria-hidden="true" />
        <b className="font-semibold text-fg">{speaker}</b>
        <span>· translated from {sourceLang}</span>
      </div>
      <p
        className={cn(
          'm-0 mb-1 break-words text-[13px] text-fg-2',
          interim && 'italic opacity-[85%]',
        )}
      >
        {original}
      </p>
      <p
        className={cn(
          'm-0 break-words text-base leading-[1.4] text-fg',
          interim && 'italic opacity-[85%]',
        )}
      >
        {translated}
      </p>
    </section>
  )
}
