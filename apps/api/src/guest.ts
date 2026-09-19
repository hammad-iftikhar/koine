import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FLOOR, LanguageCode } from '@koine/shared'

export type GuestClaims = {
  meetingCode: string
  displayName: string
  speakLang: LanguageCode
  // 'floor' (original, untranslated audio) is a legitimate choice, not a LanguageCode.
  hearLang: LanguageCode | typeof FLOOR
}

type Payload = GuestClaims & { exp: number }

const DEFAULT_TTL = 60 * 60 * 6

function secret(): string {
  const value = process.env.GUEST_TOKEN_SECRET
  if (!value) throw new Error('GUEST_TOKEN_SECRET is not set')
  // Deliberately NOT BETTER_AUTH_SECRET: leaking a guest token's key must not
  // let anyone forge a host session.
  return value
}

const b64 = (input: string) => Buffer.from(input).toString('base64url')

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export function signGuestToken(claims: GuestClaims, ttlSeconds = DEFAULT_TTL): string {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'guest' }))
  const payload: Payload = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = b64(JSON.stringify(payload))
  return `${header}.${body}.${sign(`${header}.${body}`)}`
}

/**
 * Why a guest token failed.
 *
 * Only `expired` may ever be shown to a person ("your pass ran out, rejoin
 * from the link"). Distinguishing "wrong meeting" from "bad signature" to a
 * person turns this into an oracle: a forger would learn whether a signature
 * is valid from whether the answer changes with the meeting code. Callers
 * must collapse `wrong_meeting` and `invalid` into one identical refusal.
 */
export type GuestTokenFailure = 'expired' | 'wrong_meeting' | 'invalid'

export type GuestTokenResult =
  | { ok: true; claims: GuestClaims }
  | { ok: false; reason: GuestTokenFailure }

const fail = (reason: GuestTokenFailure): GuestTokenResult => ({ ok: false, reason })

export function verifyGuestToken(token: string, expectedMeetingCode: string): GuestTokenResult {
  const parts = token.split('.')
  if (parts.length !== 3) return fail('invalid')
  const [header, body, signature] = parts as [string, string, string]

  const expected = Buffer.from(sign(`${header}.${body}`))
  const actual = Buffer.from(signature)
  // Constant-time: a length check first, because timingSafeEqual throws on
  // mismatched lengths and an exception is itself a timing signal.
  if (expected.length !== actual.length) return fail('invalid')
  if (!timingSafeEqual(expected, actual)) return fail('invalid')

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return fail('invalid')
  }

  if (payload === null || typeof payload !== 'object') return fail('invalid')

  if (typeof payload.exp !== 'number') return fail('invalid')
  if (payload.exp < Math.floor(Date.now() / 1000)) return fail('expired')
  if (payload.meetingCode !== expectedMeetingCode) return fail('wrong_meeting')

  const { meetingCode, displayName, speakLang, hearLang } = payload
  return { ok: true, claims: { meetingCode, displayName, speakLang, hearLang } }
}
