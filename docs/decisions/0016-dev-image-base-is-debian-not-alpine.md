# 0016. The dev image is Debian-based, not Alpine

**Status:** Accepted
**Decided:** 2026-09-20 · **Recorded:** 2026-09-20
**Lives in:** `docker/Dockerfile.dev`

## Context

`docker/Dockerfile.dev` builds one image for all three app containers, and
started on `node:22-alpine` — the usual choice, and correct for `api` and `web`,
which are pure JavaScript.

`apps/agent` is not. `@livekit/rtc-node` loads a native addon through
`@livekit/rtc-ffi-bindings`, and LiveKit publishes **no musl build for any
architecture**. The optional platform packages for 0.12.73 are exactly
`darwin-x64`, `darwin-arm64`, `linux-x64-gnu`, `linux-arm64-gnu` and
`win32-x64-msvc`. Alpine is musl, so on Alpine the correct binding does not
exist to install — on an Apple Silicon host or an x86 CI runner alike.

The failure is badly disguised. The agent dies at import with "Cannot find
native binding. npm has a bug related to optional dependencies", a message that
names npm, links an npm issue and recommends deleting `node_modules` — none of
which has anything to do with the actual cause. Worse, the container keeps
reporting `running`: `tsx watch` stays alive after the script it supervises
crashes, so `docker compose ps` shows a healthy-looking agent that has been dead
since boot.

## Decision

`FROM node:22-slim` (Debian bookworm, glibc). The `linux-arm64-gnu` binding then
installs and `@livekit/rtc-node` loads.

## Consequences

- A larger base image than Alpine, in dev only. Nobody waits on it twice.
- `api` and `web` are indifferent to the base; only `agent` constrains it.
  Anyone "optimising" this back to Alpine breaks the agent alone, and the error
  they get will point them at npm rather than at this file — hence the comment
  in the Dockerfile as well as this record.
- The constraint follows the dependency, not the architecture. If LiveKit ever
  ships musl builds this can be revisited; until then it holds everywhere.
