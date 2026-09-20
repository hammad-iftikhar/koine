import { createUtteranceBuffer } from './audio'
import { type FullRoster, speakerLang } from './room'

type Frame = { data: Int16Array }

type Transcriber = {
  onAudio(roomId: string, speakerIdentity: string, audio: Buffer, sourceLang: string): Promise<void>
}

/** The database default for `meeting.floor_lang`, and the last resort here. */
const DEFAULT_LANG = 'en'

/**
 * Turns one subscribed microphone track into transcription calls.
 *
 * The speaker's language is resolved once, when the track is subscribed,
 * because that is the only moment this code runs per track: LiveKit fires
 * TrackSubscribed once and never again for the same track. That makes the
 * roster read on this path load-bearing in a way `room.ts`'s is not — if it
 * throws and we give up, the speaker is untranslated for the rest of the
 * meeting. So a failed read degrades to a language rather than dropping the
 * speaker: the floor language of the last roster this room read successfully,
 * or `en`, which is what `meeting.floor_lang` defaults to.
 *
 * Falling back beats retrying here because the fallback is immediate and has
 * no failure mode of its own — a retry loop would hold the first seconds of
 * speech while it waited for a database that may be down for minutes.
 */
export function createIngest(deps: {
  loadRoster: (roomId: string) => Promise<FullRoster>
  transcriber: Transcriber
  sampleRate: number
  windowMs?: number
}) {
  const lastFloorLang = new Map<string, string>()

  async function sourceLangOf(roomId: string, speakerIdentity: string): Promise<string> {
    try {
      const roster = await deps.loadRoster(roomId)
      lastFloorLang.set(roomId, roster.floorLang)
      return speakerLang(roster, speakerIdentity)
    } catch (error) {
      console.error(`ingest: roster read failed for ${roomId}`, error)
      return lastFloorLang.get(roomId) ?? DEFAULT_LANG
    }
  }

  return {
    /** Consumes a track's frames until it ends. Resolves when it does. */
    async listen(
      roomId: string,
      speakerIdentity: string,
      frames: AsyncIterable<Frame>,
    ): Promise<void> {
      const sourceLang = await sourceLangOf(roomId, speakerIdentity)

      const utterances = createUtteranceBuffer({
        sampleRate: deps.sampleRate,
        windowMs: deps.windowMs,
        onUtterance: (wav) => {
          // Translation is an enhancement layer: a segment that fails to
          // transcribe is logged, and the next one still goes out.
          void deps.transcriber
            .onAudio(roomId, speakerIdentity, wav, sourceLang)
            .catch((error) => console.error(`ingest: transcription failed in ${roomId}`, error))
        },
      })

      for await (const frame of frames) utterances.push(frame)
      utterances.flush()
    },

    forget(roomId: string): void {
      lastFloorLang.delete(roomId)
    },
  }
}
