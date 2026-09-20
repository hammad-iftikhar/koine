# Architecture decisions

One file per decision, numbered, append-only. A decision that gets reversed
gets a new record that supersedes the old one — the old file stays, with its
status changed, because the reasoning that was wrong is worth as much as the
reasoning that was right.

## What belongs here

A decision belongs here when reversing it later would be expensive, or when
someone reading the code would reasonably ask "why is it done this way?" and
the answer is not obvious from the code itself.

Not here: anything the code already says plainly, and anything a `ponytail:`
comment covers (a deliberate shortcut with a named ceiling stays next to the
shortcut — `/ponytail-debt` harvests those).

## Adding one

Copy the shape below into `NNNN-short-kebab-title.md`, next number up. Keep it
short — if it runs past a screen, it is a design doc, not a decision record.

```markdown
# NNNN. Title in the imperative

**Status:** Accepted | Superseded by [NNNN](NNNN-....md)
**Decided:** when · **Recorded:** YYYY-MM-DD
**Lives in:** `path/to/the/code.ts`

## Context
What forced a choice.

## Decision
What was chosen.

## Consequences
What this costs, and what breaks if someone quietly undoes it.
```

Several of these were recovered from comments already in the code (the `R22`,
`R24`, `R25`, `R9` markers). The comment stays where it is — it is what a
person actually reads at 3am — and the record here is the longer form.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-path-alias-for-cross-directory-imports.md) | `@/` for cross-directory imports | Superseded by [0017](0017-path-alias-in-the-web-app-only.md) |
| [0002](0002-tests-in-a-per-package-tests-folder.md) | Tests in a per-package `tests/` folder | Accepted |
| [0003](0003-route-controller-repository-modules.md) | Route / controller / repository modules in the API | Accepted |
| [0004](0004-decisions-recorded-in-docs-decisions.md) | Decisions recorded in `docs/decisions` | Accepted |
| [0005](0005-meeting-code-is-the-only-credential.md) | The meeting code is the only credential | Accepted |
| [0006](0006-livekit-room-is-the-meeting-id.md) | The LiveKit room name is the meeting id, not its code | Accepted |
| [0007](0007-rate-limiter-fails-open.md) | The meeting rate limiter fails open | Accepted |
| [0008](0008-fixed-window-rate-limiter.md) | Fixed-window rate limiter, not sliding | Accepted |
| [0009](0009-livekit-public-url-explicit-in-production.md) | `LIVEKIT_PUBLIC_URL` must be explicit in production | Accepted |
| [0010](0010-test-databases-are-template-clones.md) | Test databases are clones of a migrated template | Accepted |
| [0011](0011-cors-allow-list-is-explicit.md) | The CORS allow-list is explicit and shared with auth | Accepted |
| [0012](0012-guest-tokens-use-their-own-secret.md) | Guest tokens are HMAC-signed with their own secret | Accepted |
| [0013](0013-chat-translation-is-lazy-and-cached.md) | Chat translation is lazy, per-reader and cached on the row | Accepted |
| [0014](0014-tts-returns-raw-pcm.md) | TTS returns raw PCM, not mp3 | Accepted |
| [0015](0015-agent-bus-is-in-process.md) | The agent's caption bus is in-process, a Map of Sets | Accepted |
| [0016](0016-dev-image-base-is-debian-not-alpine.md) | The dev image is Debian-based, not Alpine | Accepted |
| [0017](0017-path-alias-in-the-web-app-only.md) | `@/` in the web app only | Accepted |
