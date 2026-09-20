import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'
import { type GuestClaims, signGuestToken, verifyGuestToken } from '@/guest'

// `satisfies`, not a bare literal: without it TypeScript widens 'es'/'en' to
// string and every signGuestToken(claims) call fails to typecheck.
const claims = {
  meetingCode: 'kxvnvradwq',
  displayName: 'Mariam',
  speakLang: 'es',
  hearLang: 'en',
} satisfies GuestClaims

// GUEST_TOKEN_SECRET comes from vitest.config.ts, which every run loads.

it('round-trips valid claims', () => {
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toEqual({ ok: true, claims })
})

it('rejects a token minted for a different meeting', () => {
  // The trust boundary. If this ever passes, one code grants every room.
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'aaaaaaaaaa')).toEqual({ ok: false, reason: 'wrong_meeting' })
})

it('rejects a tampered payload as invalid, not as a wrong meeting', () => {
  // The signature fails before anything reads the payload, so the caller
  // learns nothing about which meeting the forger was aiming at.
  const token = signGuestToken(claims)
  const [header, payload, sig] = token.split('.')
  const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString())
  forged.meetingCode = 'aaaaaaaaaa'
  const swapped = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`
  expect(verifyGuestToken(swapped, 'aaaaaaaaaa')).toEqual({ ok: false, reason: 'invalid' })
})

it('reports an expired token as expired so the caller can say "rejoin"', () => {
  // The one failure a person is allowed to be told about.
  const token = signGuestToken(claims, -1)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toEqual({ ok: false, reason: 'expired' })
})

it('rejects garbage without throwing', () => {
  expect(verifyGuestToken('not-a-token', 'kxvnvradwq')).toEqual({ ok: false, reason: 'invalid' })
  expect(verifyGuestToken('', 'kxvnvradwq')).toEqual({ ok: false, reason: 'invalid' })
  expect(verifyGuestToken('a.b.c', 'kxvnvradwq')).toEqual({ ok: false, reason: 'invalid' })
})

it('does not accept a token signed with BETTER_AUTH_SECRET', () => {
  // A named Global Constraint: the two secrets are separate so that leaking
  // the guest key cannot forge a host session, and vice versa. That only
  // holds if they are genuinely different keys in effect, not just different
  // names for the same value.
  const authSecret = process.env.BETTER_AUTH_SECRET
  expect(authSecret).toBeTruthy()
  expect(authSecret).not.toBe(process.env.GUEST_TOKEN_SECRET)

  const real = signGuestToken(claims)
  const [header, body] = real.split('.') as [string, string]
  const forged = `${header}.${body}.${createHmac('sha256', authSecret as string)
    .update(`${header}.${body}`)
    .digest('base64url')}`

  expect(verifyGuestToken(forged, 'kxvnvradwq')).toEqual({ ok: false, reason: 'invalid' })
})
