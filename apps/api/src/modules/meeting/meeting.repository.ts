import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { meeting, participant } from '@/db/schema'

export type MeetingRow = typeof meeting.$inferSelect

export function findMeetingByCode(code: string) {
  return db.query.meeting.findFirst({ where: eq(meeting.code, code) })
}

export async function insertMeeting(values: typeof meeting.$inferInsert): Promise<void> {
  await db.insert(meeting).values(values)
}

/** Everyone still in the room — a `leftAt` row is a past attendee, not a peer. */
export function findActiveParticipants(meetingId: string) {
  return db
    .select({ id: participant.id, displayName: participant.displayName })
    .from(participant)
    .where(and(eq(participant.meetingId, meetingId), isNull(participant.leftAt)))
}

/**
 * `returning` rather than echoing the caller's values: the client picks its
 * `tr:<hearLang>` track name from this response while the agent derives the
 * channel set from this very row (its roster loader selects `p.hear_lang`).
 * Read back, the two cannot drift — if a normalisation ever lands on the write
 * path, the client follows it instead of subscribing to a channel that does
 * not exist and hearing silence with no error anywhere.
 */
export async function insertParticipant(
  values: typeof participant.$inferInsert,
): Promise<{ hearLang: string }> {
  const [inserted] = await db
    .insert(participant)
    .values(values)
    .returning({ hearLang: participant.hearLang })
  if (!inserted) throw new Error('join: participant insert returned no row')
  return inserted
}

export async function markMeetingStarted(meetingId: string): Promise<void> {
  await db.update(meeting).set({ startedAt: new Date() }).where(eq(meeting.id, meetingId))
}

export async function markMeetingEnded(meetingId: string): Promise<void> {
  await db.update(meeting).set({ endedAt: new Date() }).where(eq(meeting.id, meetingId))
}

/**
 * Scoped to the meeting on purpose, never to the participant id alone: that id
 * is the LiveKit identity, broadcast to every peer in the room, so scoping the
 * update here stops an id harvested in one meeting from marking a participant
 * as having left another. Returns false when nothing matched.
 */
export async function markParticipantLeft(
  participantId: string,
  meetingId: string,
): Promise<boolean> {
  const updated = await db
    .update(participant)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(participant.id, participantId),
        eq(participant.meetingId, meetingId),
        isNull(participant.leftAt),
      ),
    )
    .returning({ id: participant.id })
  return updated.length > 0
}
