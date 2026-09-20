import { FLOOR } from './languages'

export type ChannelInput = { hearLang: string }

export const MAX_CHANNELS_PER_ROOM = 6

/**
 * The name every synthesized channel's audio track carries: `tr:<lang>`.
 *
 * Both sides of the wire read it — the worker names its published tracks with
 * it, the client tells a translated track from the floor with it — so it lives
 * here rather than as a string literal in each package that would then be free
 * to drift.
 */
export const TRANSLATION_PREFIX = 'tr:'

/**
 * The set of languages needing a synthesized audio channel.
 *
 * One channel per language, never per listener — twenty-five people speaking
 * four languages costs four TTS streams, not twenty-five.
 *
 * Sorted so that a replacement worker rebuilding from Postgres produces exactly
 * the same set in the same order as the worker it replaced.
 */
export function deriveChannels(
  participants: ChannelInput[],
  floorLang: string,
  max = MAX_CHANNELS_PER_ROOM,
): string[] {
  const wanted = new Set<string>()

  for (const { hearLang } of participants) {
    if (hearLang === FLOOR) continue
    if (hearLang === floorLang) continue
    wanted.add(hearLang)
  }

  return [...wanted].sort().slice(0, max)
}
