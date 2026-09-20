import { describe, expect, it } from 'vitest'
import { type GridEntry, orderTiles } from '@/lib/grid'

const person = (identity: string, over: Partial<GridEntry> = {}): GridEntry => ({
  identity,
  name: identity,
  speaking: false,
  isSelf: false,
  ...over,
})

describe('orderTiles', () => {
  it('shows everyone when the room is small', () => {
    const { visible, overflow } = orderTiles([person('a'), person('b'), person('c')])
    expect(visible).toHaveLength(3)
    expect(overflow).toBe(0)
  })

  it('caps at nine and reports the remainder', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    const { visible, overflow } = orderTiles(many)
    expect(visible).toHaveLength(9)
    expect(overflow).toBe(16)
  })

  it('never paginates the active speaker off screen', () => {
    // The bug this prevents: someone talks, and the person who needs to see
    // them is on page two. It is the whole reason ordering exists.
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[20] = person('p20', { speaking: true })

    const { visible } = orderTiles(many)
    expect(visible.map((p) => p.identity)).toContain('p20')
    expect(visible[0]?.identity).toBe('p20')
  })

  it('keeps self visible even in a full room', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[22] = person('p22', { isSelf: true })
    expect(orderTiles(many).visible.map((p) => p.identity)).toContain('p22')
  })

  it('puts the speaker ahead of self when both compete', () => {
    const many = Array.from({ length: 25 }, (_, i) => person(`p${i}`))
    many[5] = person('p5', { isSelf: true })
    many[20] = person('p20', { speaking: true })
    expect(orderTiles(many).visible[0]?.identity).toBe('p20')
  })

  it('is stable for equal entries so tiles do not shuffle every render', () => {
    const many = Array.from({ length: 12 }, (_, i) => person(`p${i}`))
    expect(orderTiles(many).visible.map((p) => p.identity)).toEqual(
      orderTiles(many).visible.map((p) => p.identity),
    )
  })
})
