import { ParticipantKind } from 'livekit-client'
import { describe, expect, it } from 'vitest'
import { withoutAgents } from '@/lib/participants'

const person = (identity: string, kind: ParticipantKind = ParticipantKind.STANDARD) => ({
  identity,
  kind,
})

describe('withoutAgents', () => {
  it('leaves a room of people untouched', () => {
    const room = [person('a'), person('b')]
    expect(withoutAgents(room).map((p) => p.identity)).toEqual(['a', 'b'])
  })

  it('hides the translation worker, which joins visible so its tracks can be subscribed to', () => {
    // The bug this prevents: a tile labelled with the worker's identity, and
    // a participant count one too high in every meeting that is translated.
    const room = [person('a'), person('agent-7', ParticipantKind.AGENT), person('b')]
    expect(withoutAgents(room).map((p) => p.identity)).toEqual(['a', 'b'])
  })

  it('keeps the order of the people who remain', () => {
    const room = [person('agent-7', ParticipantKind.AGENT), person('c'), person('a')]
    expect(withoutAgents(room).map((p) => p.identity)).toEqual(['c', 'a'])
  })
})
