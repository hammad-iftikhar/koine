import { beforeAll, expect, it } from 'vitest'
import { signGuestToken, verifyGuestToken } from './guest'

const claims = {
  meetingCode: 'kxvnvradwq',
  displayName: 'Mariam',
  speakLang: 'es',
  hearLang: 'en',
}

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET ??= 'test_guest_secret_at_least_32_characters'
})

it('round-trips valid claims', () => {
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toEqual(claims)
})

it('rejects a token minted for a different meeting', () => {
  // The trust boundary. If this ever passes, one code grants every room.
  const token = signGuestToken(claims)
  expect(verifyGuestToken(token, 'aaaaaaaaaa')).toBeNull()
})

it('rejects a tampered payload', () => {
  const token = signGuestToken(claims)
  const [header, payload, sig] = token.split('.')
  const forged = JSON.parse(Buffer.from(payload as string, 'base64url').toString())
  forged.meetingCode = 'aaaaaaaaaa'
  const swapped = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`
  expect(verifyGuestToken(swapped, 'aaaaaaaaaa')).toBeNull()
})

it('rejects an expired token', () => {
  const token = signGuestToken(claims, -1)
  expect(verifyGuestToken(token, 'kxvnvradwq')).toBeNull()
})

it('rejects garbage without throwing', () => {
  expect(verifyGuestToken('not-a-token', 'kxvnvradwq')).toBeNull()
  expect(verifyGuestToken('', 'kxvnvradwq')).toBeNull()
  expect(verifyGuestToken('a.b.c', 'kxvnvradwq')).toBeNull()
})
