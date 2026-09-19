export type GridEntry = {
  identity: string
  name: string
  speaking: boolean
  isSelf: boolean
}

const MAX_VISIBLE = 9

/**
 * Speakers first, then self, then everyone else in arrival order.
 *
 * `Array.prototype.sort` is stable in every engine we target, so equal entries
 * keep their relative order and tiles do not shuffle on each render — a
 * comparator that returns 0 must not be "improved" into a tiebreaker.
 */
export function orderTiles(
  entries: GridEntry[],
  maxVisible = MAX_VISIBLE,
): { visible: GridEntry[]; overflow: number } {
  const rank = (e: GridEntry) => (e.speaking ? 0 : e.isSelf ? 1 : 2)
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b))

  return {
    visible: ordered.slice(0, maxVisible),
    overflow: Math.max(0, ordered.length - maxVisible),
  }
}
