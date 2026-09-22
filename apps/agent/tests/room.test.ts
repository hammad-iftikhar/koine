import { expect, it, vi } from 'vitest'
import { createChannelState } from '../src/room'

it('rebuilds the channel set from the database, not from client state', async () => {
  // This is what makes failover work: a replacement worker asks Postgres, and
  // needs no cooperation from any client.
  const load = vi.fn(async () => ({
    floorLang: 'es',
    participants: [{ hearLang: 'en' }, { hearLang: 'en' }, { hearLang: 'ur' }],
  }))

  const state = createChannelState({ load })
  await state.refresh('room-a')

  expect(state.channels('room-a')).toEqual(['en', 'ur'])
  expect(load).toHaveBeenCalledWith('room-a')
})

it('drops a channel when its last listener leaves', async () => {
  const rosters = [
    { floorLang: 'es', participants: [{ hearLang: 'en' }, { hearLang: 'ur' }] },
    { floorLang: 'es', participants: [{ hearLang: 'en' }] },
  ]
  let call = 0
  const state = createChannelState({ load: async () => rosters[call++] as never })

  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en', 'ur'])

  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en'])
})

it('returns an empty set for a room it has never seen', () => {
  const state = createChannelState({ load: vi.fn() as never })
  expect(state.channels('unknown')).toEqual([])
})

it('keeps the previous set when a refresh fails', async () => {
  // A transient database blip must not silence a working room.
  const state = createChannelState({
    load: vi
      .fn()
      .mockResolvedValueOnce({ floorLang: 'es', participants: [{ hearLang: 'en' }] })
      .mockRejectedValueOnce(new Error('db down')),
  })

  await state.refresh('room-a')
  await state.refresh('room-a')
  expect(state.channels('room-a')).toEqual(['en'])
})
