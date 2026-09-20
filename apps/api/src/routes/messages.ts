import { randomUUID } from 'node:crypto'
import { FLOOR, normalizeMeetingCode, SendMessageBody } from '@koine/shared'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/client'
import { meeting, message, participant } from '../db/schema'
import { getTranslator } from '../translate'

export async function messageRoutes(app: FastifyInstance) {
  app.post<{ Params: { code: string } }>('/api/meetings/:code/messages', async (request, reply) => {
    const code = normalizeMeetingCode(request.params.code)
    if (!code) return reply.status(404).send({ message: 'Meeting code not found.' })

    const parsed = SendMessageBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Type a message before sending.' })
    }

    const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
    if (!found) return reply.status(404).send({ message: 'Meeting code not found.' })

    const sender = await db.query.participant.findFirst({
      where: eq(participant.id, parsed.data.participantId),
    })
    // The participant id comes from the client. Verify it belongs to this
    // meeting, or anyone can post into any room they know the code of.
    if (!sender || sender.meetingId !== found.id) {
      return reply.status(403).send({ message: 'You are not in this meeting.' })
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
    await db.insert(message).values(row)

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
  })

  app.get<{ Params: { code: string }; Querystring: { hear?: string } }>(
    '/api/meetings/:code/messages',
    async (request, reply) => {
      const code = normalizeMeetingCode(request.params.code)
      if (!code) return reply.status(404).send({ message: 'Meeting code not found.' })

      const found = await db.query.meeting.findFirst({ where: eq(meeting.code, code) })
      if (!found) return reply.status(404).send({ message: 'Meeting code not found.' })

      const rows = await db
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
        .where(eq(message.meetingId, found.id))
        .orderBy(asc(message.createdAt))

      const hear = request.query.hear
      const out = []

      for (const row of rows) {
        const translations = (row.translations ?? {}) as Record<string, string>

        // Translate lazily, once per language, and cache on the row. Skip
        // when the reader already shares the author's language, and skip
        // FLOOR — it means "original audio", not a language to translate
        // into, and asking the translator for it would burn a call and
        // cache junk on the row.
        if (hear && hear !== row.lang && hear !== FLOOR && !translations[hear]) {
          try {
            const produced = await getTranslator().translate(row.body, row.lang, [hear])
            Object.assign(translations, produced)
            await db.update(message).set({ translations }).where(eq(message.id, row.id))
          } catch (error) {
            // The message is never hidden because it could not be translated.
            request.log.error?.({ error }, 'chat translation failed')
          }
        }

        out.push({
          id: row.id,
          author: row.author,
          participantId: row.participantId,
          body: row.body,
          lang: row.lang,
          translations,
          createdAt: row.createdAt.toISOString(),
        })
      }

      return { messages: out, nextCursor: null }
    },
  )
}
