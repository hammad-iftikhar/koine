# 0013. Chat translation is lazy, per-reader, and cached on the row

**Status:** Accepted
**Decided:** module 07 (chat) · **Recorded:** 2026-09-20
**Lives in:** `apps/api/src/modules/message/`

## Context

Translating each message into every language in the room on write means paying
for translations nobody reads, and grows with the number of languages present
rather than with the number of readers.

## Decision

A message is stored in the language its author spoke. `GET .../messages?hear=xx`
translates only what that reader needs, skipping rows already in their language,
skipping `FLOOR` (which means "original audio", not a language), and skipping
anything already cached. Results are cached on the row, so each
(message, language) pair is paid for once.

`?hear=` is validated against the same `HearLang` set that `join` uses. Junk
would otherwise reach the translator as a target language and trigger — and
cache — a fresh translation of every message in the room for anyone holding the
code.

The cache write is `translations || produced::jsonb`, merged in SQL rather than
read-modify-written in JS: two concurrent readers wanting different languages
for one message both start from the same SELECT snapshot, and a wholesale
write-back would discard whichever language landed first. `produced` is a bound
parameter, never spliced into SQL text.

Backlog rows are translated by five workers pulling off a shared index cursor —
marked `ponytail:`, a cap with no new dependency. In series, the first reader in
a new language paid backlog-size × per-call latency in one blocking response.

## Consequences

- Cost tracks readers, not room composition.
- The first reader in a language waits; everyone after them does not.
- A translation failure logs and returns the original. A message is never hidden
  because it could not be translated.
