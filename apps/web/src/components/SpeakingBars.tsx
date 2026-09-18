/**
 * Three bars. Speaking indicator in a tile, mic-live in the control bar, and
 * input level in pre-join — one primitive, three jobs.
 *
 * Decorative: the mute/speaking state is also carried by the mic icon's shape,
 * so this is hidden from assistive technology rather than announced twice.
 */
export function SpeakingBars({ active }: { active: boolean }) {
  return (
    <span
      data-testid="speaking-bars"
      data-active={String(active)}
      aria-hidden="true"
      className="inline-flex h-[11px] items-end gap-[2px] text-blue"
    >
      {[0, 1, 2].map((i) => (
        <i
          key={i}
          className="w-[2.5px] origin-bottom rounded-[2px] bg-current"
          style={{
            height: '100%',
            transform: active ? undefined : 'scaleY(0.2)',
            animation: active ? 'koine-eq 0.7s ease-in-out infinite alternate' : undefined,
            animationDelay: active ? `${-0.23 * i}s` : undefined,
          }}
        />
      ))}
    </span>
  )
}
