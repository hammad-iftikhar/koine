import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { message, participant } from '../../db/schema'

export function findParticipantById(participantId: string) {
  return db.query.participant.findFirst({ where: eq(participant.id, participantId) })
}

export async function insertMessage(values: typeof message.$inferInsert): Promise<void> {
  await db.insert(message).values(values)
}

/** The room's whole backlog, oldest first, with each author's display name. */
export function listMessages(meetingId: string) {
  return db
    .select({
      id: message.id,
      body: message.body,
      lang: message.lang,
      translations: message.translations,
      createdAt: message.createdAt,
      participantId: message.participantId,
      author: participant.displayName,
    })
    .from(message)
    .innerJoin(participant, eq(message.participantId, participant.id))
    .where(eq(message.meetingId, meetingId))
    .orderBy(asc(message.createdAt))
}

/**
 * Merges one freshly translated language into the row's cached `translations`
 * at the SQL level (`translations || produced::jsonb`) instead of reading the
 * column into JS, mutating a local copy, and writing the whole column back.
 * Two concurrent readers wanting different uncached languages for the same
 * message both start from the same SELECT snapshot; if either wrote its
 * in-memory copy back wholesale, whichever write landed second would
 * silently discard the language the first one had just cached. `||` reads
 * Postgres's live column value at UPDATE time, not a JS variable, so
 * whichever write lands second still keeps what the first one added.
 * `produced` is passed as a bound parameter, never spliced into the SQL text.
 */
export async function cacheTranslation(
  rowId: string,
  produced: Record<string, string>,
): Promise<void> {
  await db
    .update(message)
    .set({ translations: sql`${message.translations} || ${JSON.stringify(produced)}::jsonb` })
    .where(eq(message.id, rowId))
}
