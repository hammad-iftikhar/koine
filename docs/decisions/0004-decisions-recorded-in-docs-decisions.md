# 0004. Record architecture decisions in `docs/decisions`

**Status:** Accepted
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** `docs/decisions/`

## Context

The reasoning behind this system's non-obvious choices was spread across three
places that do not survive contact with a new reader: long comments in the code
(the `R22`, `R24`, `R25`, `R9` markers), plan and spec documents under
`docs/superpowers/` that describe intent rather than what was settled, and the
review diffs under `.superpowers/sdd/`, which nobody will read again.

Several of those comments exist specifically because someone had already tried
to "fix" the thing they describe.

## Decision

`docs/decisions/NNNN-title.md`, numbered, append-only, one decision per file,
with context, decision and consequences. Reversals get a new record that
supersedes the old one rather than an edit.

The code comments stay where they are. A decision record is not a substitute
for the warning sitting on the line someone is about to change; it is the
longer form for the person deciding whether to change it at all.

## Consequences

- A new record is one small file, so the cost of writing one is low enough that
  it actually happens.
- Nothing enforces this. A decision made and not written down is invisible,
  same as before.
- Two other conventions already cover their own ground and are not moving here:
  `ponytail:` comments mark deliberate shortcuts with a named ceiling, and
  `docs/superpowers/` holds plans and specs.
