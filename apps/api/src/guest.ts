import { createHmac, timingSafeEqual } from 'node:crypto'

export type GuestClaims = {
  meetingCode: string
  displayName: string
  speakLang: string
  hearLang: string
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

export function verifyGuestToken(token: string, expectedMeetingCode: string): GuestClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts as [string, string, string]

  const expected = Buffer.from(sign(`${header}.${body}`))
  const actual = Buffer.from(signature)
  // Constant-time: a length check first, because timingSafeEqual throws on
  // mismatched lengths and an exception is itself a timing signal.
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  if (payload.meetingCode !== expectedMeetingCode) return null

  const { meetingCode, displayName, speakLang, hearLang } = payload
  return { meetingCode, displayName, speakLang, hearLang }
}
