/** 25 lowercase letters. 'l' is excluded — it is unreadable next to '1' and 'I'. */
export const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyz'

const LENGTH = 10
const GROUPS = [3, 4, 3] as const

/**
 * One uniformly distributed letter from a CSPRNG.
 *
 * Rejection sampling, not `% 25`: 2^32 is not a multiple of 25, so plain modulo
 * makes the first six letters fractionally more likely. It would never be
 * noticed and it would quietly shrink the keyspace of every meeting code.
 */
function randomLetter(): string {
  const limit = Math.floor(0xffffffff / CODE_ALPHABET.length) * CODE_ALPHABET.length
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0] as number
  } while (value >= limit)
  return CODE_ALPHABET[value % CODE_ALPHABET.length] as string
}

export function generateMeetingCode(): string {
  let out = ''
  for (let i = 0; i < LENGTH; i++) out += randomLetter()
  return formatMeetingCode(out)
}

/** Returns the 10-character storage form, or null if the input is not a code. */
export function normalizeMeetingCode(input: string): string | null {
  const stripped = input.toLowerCase().replace(/[\s-]/g, '')
  if (stripped.length !== LENGTH) return null
  for (const ch of stripped) if (!CODE_ALPHABET.includes(ch)) return null
  return stripped
}

export function formatMeetingCode(normalized: string): string {
  let at = 0
  return GROUPS.map((size) => normalized.slice(at, (at += size))).join('-')
}
