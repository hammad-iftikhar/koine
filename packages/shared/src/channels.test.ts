import { describe, expect, it } from 'vitest'
import { deriveChannels } from './channels'

const p = (hearLang: string) => ({ hearLang })

describe('deriveChannels', () => {
  it('needs no channel when everyone hears the floor language', () => {
    expect(deriveChannels([p('en'), p('en'), p('en')], 'en')).toEqual([])
  })

  it('needs no channel for listeners on the raw floor', () => {
    expect(deriveChannels([p('floor'), p('floor')], 'es')).toEqual([])
  })

  it('creates one channel per distinct language, not per listener', () => {
    // The entire cost argument. Twenty-five people, four languages, four channels.
    const room = [
      ...Array.from({ length: 10 }, () => p('en')),
      ...Array.from({ length: 10 }, () => p('ur')),
      ...Array.from({ length: 5 }, () => p('ja')),
    ]
    expect(deriveChannels(room, 'es')).toEqual(['en', 'ja', 'ur'])
  })

  it('excludes the floor language even when someone selected it explicitly', () => {
    expect(deriveChannels([p('es'), p('en')], 'es')).toEqual(['en'])
  })

  it('drops a channel when its last listener leaves', () => {
    expect(deriveChannels([p('en'), p('ur')], 'es')).toEqual(['en', 'ur'])
    expect(deriveChannels([p('en')], 'es')).toEqual(['en'])
  })

  it('returns an empty set for an empty room', () => {
    expect(deriveChannels([], 'en')).toEqual([])
  })

  it('is sorted, so a rebuild after a worker dies produces the same set', () => {
    expect(deriveChannels([p('ur'), p('en'), p('ja')], 'es')).toEqual(['en', 'ja', 'ur'])
  })

  it('caps at the configured maximum rather than exhausting the worker', () => {
    // One pathological meeting must not take down every other room on the box.
    const room = [p('en'), p('es'), p('ur'), p('ja')]
    expect(deriveChannels(room, 'de', 2)).toEqual(['en', 'es'])
  })
})
