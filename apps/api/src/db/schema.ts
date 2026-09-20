import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Better Auth's required shape. Generated once, then committed — do not
// hand-edit column names, the library looks them up by name.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const meeting = pgTable(
  'meeting',
  {
    id: text('id').primaryKey(),
    // Normalised form: ten letters, no dashes. formatMeetingCode() adds them for display.
    code: text('code').notNull(),
    title: text('title'),
    hostUserId: text('host_user_id').references(() => user.id, { onDelete: 'set null' }),
    floorLang: text('floor_lang').notNull().default('en'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
  },
  (t) => ({ codeIdx: uniqueIndex('meeting_code_idx').on(t.code) }),
)

export const participant = pgTable(
  'participant',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meeting.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    speakLang: text('speak_lang').notNull(),
    // 'floor' means original audio. Stored, not client state — plan 06's agent
    // rebuilds the translation channel set from this column after a worker dies.
    hearLang: text('hear_lang').notNull(),
    role: text('role').notNull(),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
    leftAt: timestamp('left_at'),
  },
  (t) => ({ liveIdx: index('participant_live_idx').on(t.meetingId, t.leftAt) }),
)

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meeting.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    /** Exactly as typed. Never overwritten by a translation. */
    body: text('body').notNull(),
    lang: text('lang').notNull(),
    /**
     * language code → translated text, filled lazily and cached.
     * jsonb rather than a side table: messages are short, the key set is bounded
     * by the room's languages, and a join buys nothing here.
     */
    translations: jsonb('translations').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ orderIdx: index('message_order_idx').on(t.meetingId, t.createdAt) }),
)
