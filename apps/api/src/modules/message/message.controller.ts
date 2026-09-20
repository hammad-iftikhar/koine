import { randomUUID } from 'node:crypto'
import { FLOOR, HearLang, normalizeMeetingCode, SendMessageBody } from '@koine/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  ACTION_LIMIT,
  ACTION_WINDOW,
  enforceRateLimit,
  LOOKUP_LIMIT,
  LOOKUP_WINDOW,
} from '@/guards'
import { findMeetingByCode } from '@/modules/meeting/meeting.repository'
import {
  cacheTranslation,
  findParticipantById,
  insertMessage,
  listMessages,
} from '@/modules/message/message.repository'
import { getTranslator } from '@/translate'

const MESSAGE_MEETING_NOT_FOUND = 'Meeting code not found.'

// Concurrent translator calls in flight while filling a backlog for one GET.
//
// ponytail: a plain index cursor, not a queue library — five workers each
// pulling the next index off a shared counter is the whole primitive this
// needs, and it needs no new dependency.
const TRANSLATE_CONCURRENCY = 5

export async function postMessage(
  request: FastifyRequest<{ Params: { code: string } }>,
  reply: FastifyReply,
) {
  // A meeting code from an unauthenticated caller, same as lookup/join/end
  // (see enforceRateLimit in @/guards) — and this one also writes an
  // unbounded-frequency, 2000-char row per request.
  if (!(await enforceRateLimit(request, reply, 'message-post', ACTION_LIMIT, ACTION_WINDOW)))
    return reply

  const code = normalizeMeetingCode(request.params.code)
  if (!code) return reply.status(404).send({ message: MESSAGE_MEETING_NOT_FOUND })

  const parsed = SendMessageBody.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ message: 'Type a message before sending.' })
  }

  const found = await findMeetingByCode(code)
  if (!found) return reply.status(404).send({ message: MESSAGE_MEETING_NOT_FOUND })
  if (found.endedAt) {
    return reply.status(410).send({ message: 'This meeting has ended.' })
  }

  const sender = await findParticipantById(parsed.data.participantId)
  // The participant id comes from the client. Verify it belongs to this
  // meeting, or anyone can post into any room they know the code of.
  if (!sender || sender.meetingId !== found.id) {
    return reply.status(403).send({ message: 'You are not in this meeting.' })
  }
  // A participant who has left is no longer in the call and must not keep
  // appending to the retained record.
  if (sender.leftAt) {
    return reply.status(403).send({ message: 'You have left this meeting.' })
  }

  const row = {
    id: randomUUID(),
    meetingId: found.id,
    participantId: sender.id,
    body: parsed.data.body,
    lang: sender.speakLang,
    translations: {},
    createdAt: new Date(),
  }
  await insertMessage(row)

  return reply.status(201).send({
    message: {
      id: row.id,
      author: sender.displayName,
      participantId: sender.id,
      body: row.body,
      lang: row.lang,
      translations: {},
      createdAt: row.createdAt.toISOString(),
    },
  })
}

export async function listMessagesForReader(
  request: FastifyRequest<{ Params: { code: string }; Querystring: { hear?: string } }>,
  reply: FastifyReply,
) {
  if (!(await enforceRateLimit(request, reply, 'message-lookup', LOOKUP_LIMIT, LOOKUP_WINDOW)))
    return reply

  const code = normalizeMeetingCode(request.params.code)
  if (!code) return reply.status(404).send({ message: MESSAGE_MEETING_NOT_FOUND })

  const found = await findMeetingByCode(code)
  if (!found) return reply.status(404).send({ message: MESSAGE_MEETING_NOT_FOUND })

  const rows = await listMessages(found.id)

  // `?hear=` is untrusted querystring: empty reaches the translator as a
  // real target language, a repeated key arrives as an array and would
  // build an invalid OpenAI json-schema, and any other junk value would
  // trigger — and cache — a fresh translation of every message in the
  // room for whoever holds the meeting code. Validate against the exact
  // set `HearLang` already defines for join's `hearLang`; anything else
  // is treated as absent (no translation requested), not as a language.
  const hearParsed = HearLang.optional().safeParse(request.query.hear)
  const hear = hearParsed.success ? hearParsed.data : undefined

  // Per-row translations for THIS response: seeded from the SELECT
  // snapshot, then filled in below as translations complete. Kept
  // separate from what gets persisted — the response must show the
  // translation this request just produced even though the row it read
  // is a point-in-time snapshot.
  const translationsByRow = new Map<string, Record<string, string>>(
    rows.map((row) => [row.id, { ...((row.translations ?? {}) as Record<string, string>) }]),
  )

  // Translate lazily, once per (message, language), and cache on the
  // row. Skip when the reader already shares the author's language,
  // skip FLOOR — it means "original audio", not a language to translate
  // into — and skip anything already cached.
  //
  // Run the uncached rows concurrently rather than one at a time: the
  // translator interface is unchanged (still one call per row), but
  // awaiting them in series meant a late joiner who is the first reader
  // in a language paid backlog-size x per-call latency in a single
  // blocking response.
  const toTranslate = rows.filter(
    (row) =>
      hear !== undefined &&
      hear !== row.lang &&
      hear !== FLOOR &&
      !translationsByRow.get(row.id)?.[hear],
  )

  async function translateOne(row: (typeof toTranslate)[number]) {
    try {
      const produced = await getTranslator().translate(row.body, row.lang, [hear as string])
      if (Object.keys(produced).length === 0) return
      Object.assign(translationsByRow.get(row.id) as Record<string, string>, produced)
      await cacheTranslation(row.id, produced)
    } catch (error) {
      // The message is never hidden because it could not be translated.
      request.log.error?.({ error }, 'chat translation failed')
    }
  }

  // ponytail: TRANSLATE_CONCURRENCY workers pulling off a shared index
  // cursor — the cap module 06 requires against hammering OpenAI, with
  // no new dependency. Cursor is closed over rather than passed, so
  // there is exactly one shared counter regardless of worker count.
  let cursor = 0
  async function worker() {
    while (cursor < toTranslate.length) {
      const row = toTranslate[cursor++]
      if (row) await translateOne(row)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, toTranslate.length) }, worker),
  )

  const out = rows.map((row) => ({
    id: row.id,
    author: row.author,
    participantId: row.participantId,
    body: row.body,
    lang: row.lang,
    translations: translationsByRow.get(row.id) ?? {},
    createdAt: row.createdAt.toISOString(),
  }))

  return { messages: out, nextCursor: null }
}
