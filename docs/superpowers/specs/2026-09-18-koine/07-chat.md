# 07 — Chat

In-call messages, translated per reader.

## Transport

LiveKit data channels, reliable. No second realtime system — the room connection
already exists and carries the message.

Persistence is a separate concern from delivery: the sender publishes to the data
channel for immediate delivery, and the API stores the message for history and for
people who join late. A failed store does not block delivery.

## Translation of messages

Chat is translated per reader, the same principle as captions. The original is
kept and shown; the translation sits beneath it.

Translation happens on the API, not in the agent — chat is text-only, low volume,
and does not belong in the audio pipeline's latency budget. Results are cached on
the message row, so a message is translated once per target language regardless of
how many people read it.

```
message
  id            uuid pk
  meeting_id    uuid fk → meeting
  participant_id uuid fk → participant
  body          text not null          -- as typed
  lang          text not null          -- detected or from participant.speak_lang
  translations  jsonb not null default '{}'   -- { "en": "...", "ur": "..." }
  created_at    timestamptz not null
```

`translations` is a jsonb column rather than a side table. Messages are short, the
key set is small and bounded by the room's languages, and a join buys nothing here.

Index: `message (meeting_id, created_at)`.

## Interfaces

```
POST /api/meetings/:code/messages      → { message }    stores + translates
GET  /api/meetings/:code/messages      → { messages }   history, paginated
```

The client publishes to the data channel and POSTs in parallel. Late joiners fetch
history on open.

## Behaviour

- Messages are visible to everyone in the call — the panel says so, once, at the
  top. This is Meet's copy and it is correct: people assume chat is private and it
  is not.
- History is available to anyone who joins while the meeting is live
- After the meeting ends, chat is retained with the meeting record. Retention
  policy is a deployment concern — see module 08.
- Own messages render in blue; others render on the pane fill (module 02)

## Failure behaviour

- Data channel delivery fails → the message still lands via history on next fetch
- Translation fails → the original is shown with a quiet "translation unavailable"
  marker. The message is never hidden because it could not be translated.
- Store fails → the message was still delivered live; surface a retry rather than
  silently losing it

### Open item — a store failure is not just "surface a retry", it blocks delivery too

This promises that a failed store still leaves the message delivered live, with
only the store side needing a retry. The implementation does not do that: `send()`
in `RoomChat` awaits the `POST` and only publishes to the data channel once it
resolves, so a store failure means nothing goes out over the room connection
either. Nobody else in the call sees the message until the sender retries and the
store succeeds.

Publishing before the store confirms would need a client-generated message id and
the sender's `lang` (`participant.speak_lang`) to build a valid `ChatMessageDTO`
ahead of the server's response. The client has neither: `JoinResponse` carries
`identity`, `participantId` and `hearLang`, not `speakLang`, and there is no
server-accepted client-supplied id for a message. Fixing this means changing the
join response and the message-creation contract — another plan's work, not a
patch to `RoomChat`.

Until then, what a sender gets on a store failure is the retry notice `RoomChat`
built: the typed text is kept and re-sendable, but it is not "still delivered
live" — it is not delivered at all until the retry succeeds.

## Tests

- A message sent by A appears for B — covered in the two-browser Playwright spec
- Translation is cached: a second reader in the same language does not trigger a
  second API translation call
- A message with a failed translation renders the original, not an error state
- History pagination returns messages in order across a page boundary

## Done when

- Two browsers exchange messages live
- A third browser joining mid-meeting sees the prior messages
- A reader with a different `hear_lang` sees the translation under the original
