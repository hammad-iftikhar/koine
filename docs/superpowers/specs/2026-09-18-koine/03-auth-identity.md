# 03 — Auth & Identity

## Scope

Google sign-in for hosts. Guests join by link or code without an account.

## Choice

**Better Auth** with the Google provider, sessions in Postgres, Drizzle adapter.
Chosen over Auth.js because it works identically for a Vite SPA talking to a
standalone Fastify API, without Next-shaped assumptions.

## Two kinds of participant

| | Account | Can create meetings | Identity source |
|---|---|---|---|
| **Host** | Yes, Google | Yes | Google profile: name, email, avatar |
| **Guest** | No | No | Display name entered at pre-join |

Both appear identically in a room. The distinction exists only at meeting
creation and for chat attribution after the fact.

**Open item:** whether a guest picks their own display name freely, or whether it
is constrained. Free-text names are impersonation surface in a room a host did not
curate. Decide before implementing pre-join; the lazy answer is free text plus a
"guest" marker on the tile that cannot be removed.

## Session handling

- HTTP-only, secure, SameSite=Lax cookie
- Session lookup on every API request through a Fastify decorator
- The SPA never reads the session cookie; it calls `GET /api/me` and caches with
  TanStack Query
- Signing out revokes the session row, not just the cookie

## Guest identity

A guest gets a signed, short-lived token scoped to one meeting, issued by the join
endpoint. It is not a session and grants nothing outside that room. It carries the
display name and chosen languages so a reconnect does not re-prompt.

## Schema

Better Auth owns `user`, `session`, `account` and `verification`. Do not
hand-write them; take the generated schema and commit it.

## Interfaces

```
GET  /api/auth/*          Better Auth handler mount
GET  /api/me              → { user } | { user: null }
POST /api/auth/sign-out
```

## Security

- Google OAuth client secret is server-side only and never reaches the SPA
- Redirect URIs are allow-listed per environment
- Rate-limit sign-in attempts per IP
- The guest token is signed with a separate secret from session cookies, so
  leaking one does not compromise the other

## Tests

- `GET /api/me` with no cookie returns `{ user: null }`, not a 401
- A revoked session is rejected on the next request
- A guest token scoped to meeting A is rejected by meeting B — trust boundary,
  gets an explicit test
- An expired guest token is rejected with a message telling the user to rejoin

## Done when

- Google sign-in completes and `GET /api/me` returns the profile
- A guest can reach pre-join with no account
- The cross-meeting guest token test passes
