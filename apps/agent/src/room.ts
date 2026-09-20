import { deriveChannels } from '@koine/shared'
import type { Sql } from 'postgres'

export type Roster = { floorLang: string; participants: { hearLang: string }[] }

/**
 * The channel set per room, rebuilt from Postgres.
 *
 * Deliberately not fed by client events: after a worker dies, its replacement
 * must reconstruct the same set with no client cooperation. The database is the
 * only source that survives the worker.
 */
export function createChannelState(deps: { load: (roomId: string) => Promise<Roster> }) {
  const byRoom = new Map<string, string[]>()

  return {
    async refresh(roomId: string): Promise<void> {
      try {
        const roster = await deps.load(roomId)
        byRoom.set(roomId, deriveChannels(roster.participants, roster.floorLang))
      } catch (error) {
        // Keep the previous set. A transient blip must not silence a live room.
        console.error(`room: channel refresh failed for ${roomId}`, error)
      }
    },

    channels(roomId: string): string[] {
      return byRoom.get(roomId) ?? []
    },

    forget(roomId: string): void {
      byRoom.delete(roomId)
    },
  }
}

export type RosterParticipant = { identity: string; hearLang: string; speakLang: string }

/** A roster as the database returns it: the {@link Roster} plus who is speaking what. */
export type FullRoster = { floorLang: string; participants: RosterParticipant[] }

type RosterRow = {
  floor_lang: string
  identity: string | null
  hear_lang: string | null
  speak_lang: string | null
}

/**
 * Loads a room's roster with one parameterized query.
 *
 * Keyed on `meeting.id`, because the LiveKit room name is the meeting's id and
 * never its code — plan 04 R22: the code is this system's only credential and
 * room names reach LiveKit's logs, webhooks and dashboards.
 *
 * Read through the `postgres` driver rather than Drizzle: the schema lives in
 * `@koine/api`, an application with no exports, and the agent must not reach
 * across apps to import it. A LEFT JOIN so that an empty room still yields its
 * floor language; `left_at is null` is what makes a participant live, and the
 * `participant_live_idx` index exists for exactly this predicate.
 */
export function createRosterLoader(sql: Sql) {
  return async function load(roomId: string): Promise<FullRoster> {
    const rows = await sql<RosterRow[]>`
      select m.floor_lang, p.id as identity, p.hear_lang, p.speak_lang
      from meeting m
      left join participant p on p.meeting_id = m.id and p.left_at is null
      where m.id = ${roomId}
    `

    const first = rows[0]
    if (!first) throw new Error(`room: no meeting with id ${roomId}`)

    return {
      floorLang: first.floor_lang,
      participants: rows.flatMap((row) =>
        row.identity && row.hear_lang && row.speak_lang
          ? [{ identity: row.identity, hearLang: row.hear_lang, speakLang: row.speak_lang }]
          : [],
      ),
    }
  }
}

/**
 * What a speaker speaks, falling back to the floor language for a participant
 * the roster has not seen yet. Transcribing in the wrong language degrades the
 * captions; refusing to transcribe would silence the speaker entirely.
 */
export function speakerLang(roster: FullRoster, identity: string): string {
  return roster.participants.find((p) => p.identity === identity)?.speakLang ?? roster.floorLang
}
