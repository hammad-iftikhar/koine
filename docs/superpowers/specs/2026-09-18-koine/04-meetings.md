# 04 — Meetings

Creating a meeting, sharing it, and getting people into it.

## Meeting codes

Format `xxx-xxxx-xxx`, Google Meet's shape, lowercase letters only.

Alphabet excludes `l` to avoid confusion with `1` and `I`. Ten characters from a
25-letter alphabet is roughly 25^10 — large enough that guessing is not the
attack, but the lookup endpoint is rate-limited anyway because enumeration
attempts should be visible and cheap to stop.

Codes are generated with a CSPRNG, not `Math.random`. Stored normalised
(lowercase, dashes stripped); lookup normalises input the same way, so
`KXV NVRA DWQ` and `kxv-nvra-dwq` both resolve.

Code generation and parsing live in `packages/shared` and are pure functions with
unit tests: round-trip, normalisation, rejection of the excluded letter, rejection
of wrong length.

## Meeting links

`https://<host>/j/<code>`. Opening the link resolves the code and lands on
pre-join. No separate link token — the code *is* the credential, which is why its
entropy and rate limiting matter.

## Join policy

Anyone with the link or code may join. This is the stated requirement and it is
what the copy on the home screen promises.

Consequences, made explicit so they are not discovered later:

- A leaked code is a leaked meeting. There is no second factor.
- Codes must therefore be unguessable and lookups rate-limited per IP.
- The rate limiter **must use a shared store**, not per-process memory. With six
  API instances an in-memory limiter permits six times the intended rate, and the
  only protection on a guessable code quietly weakens. Redis; see module 08.
- A host can end a meeting, which invalidates the code for new joins.

A waiting room would change this and is out of scope for v1.

## Lifecycle

```
created ──▶ live ──▶ ended
```

- **created** — record exists, nobody has joined
- **live** — at least one participant connected
- **ended** — host ended it, or the room emptied and the idle timeout elapsed

Ending releases the LiveKit room and shuts down any translation channels, which
is the cost control that matters most. See module 08.

## Schema

```
meeting
  id            uuid pk
  code          text unique not null      -- normalised
  title         text
  host_user_id  uuid fk → user            -- null once the host account is deleted
  floor_lang    text                      -- default language of the room
  created_at    timestamptz not null
  started_at    timestamptz
  ended_at      timestamptz

participant
  id            uuid pk
  meeting_id    uuid fk → meeting
  user_id       uuid fk → user null       -- null for guests
  display_name  text not null
  speak_lang    text not null
  hear_lang     text not null             -- 'floor' means original audio
  role          text not null             -- 'host' | 'guest'
  joined_at     timestamptz not null
  left_at       timestamptz
```

`hear_lang` drives the translation channel set — see module 06. It is stored,
not merely held in client state, so the agent can derive the required channels
without asking every client.

Indexes: `meeting.code` unique; `participant (meeting_id, left_at)` for the live
roster query.

## Interfaces

```
POST /api/meetings                   → { code, title }           auth required
GET  /api/meetings/:code             → { meeting, participants } public, rate-limited
POST /api/meetings/:code/join        → { livekitToken, identity, participantId }
POST /api/meetings/:code/leave
POST /api/meetings/:code/end         auth required, host only
```

`join` is the only place a LiveKit token is minted. It validates the code, checks
the meeting is not ended, records the participant row with their languages, and
only then mints a token scoped to that room and identity. Minting never happens
client-side. See module 05 for token grants.

All bodies and responses are Zod schemas in `packages/shared`.

## Errors

| Case | Response | Message shown |
|---|---|---|
| Code not found | 404 | "Meeting code not found — check the code or ask the host for the link" |
| Meeting ended | 410 | "This meeting has ended" |
| Rate limited | 429 | "Too many attempts — wait a moment and try again" |
| Not host | 403 | "Only the host can end this meeting" |

## Scaling notes

The API is stateless: session lookup hits Postgres, token minting is pure, and
nothing is held between requests. Instances can be added behind a load balancer
with no sticky routing.

The two pieces of shared state this module needs are the rate-limit counters and,
at higher volume, a cached code → meeting lookup. Both belong in Redis. The
`meeting.code` unique index makes the uncached lookup cheap enough that caching is
a later optimisation, not a launch requirement.

## Tests

- Code round-trip, normalisation, excluded-letter rejection — pure, fast
- Join with an unknown code returns 404 without touching LiveKit
- Join an ended meeting returns 410
- Join records `speak_lang` and `hear_lang` on the participant row
- `end` from a non-host returns 403 — trust boundary
- Rate limiter blocks the eleventh lookup in a window
- Rate limiter counts across processes: two API instances sharing Redis enforce
  one combined limit, not one each

## Done when

- A signed-in user creates a meeting and gets a shareable link
- A second browser joins by pasting the code, with normalisation applied
- Ending the meeting makes the code stop working for new joins
