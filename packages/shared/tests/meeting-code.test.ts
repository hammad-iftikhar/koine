import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  formatMeetingCode,
  generateMeetingCode,
  normalizeMeetingCode,
} from '@/meeting-code'

describe('generateMeetingCode', () => {
  it('produces the xxx-xxxx-xxx shape', () => {
    expect(generateMeetingCode()).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
  })

  it('never emits the excluded letter', () => {
    expect(CODE_ALPHABET).not.toContain('l')
    const codes = Array.from({ length: 500 }, generateMeetingCode).join('')
    expect(codes).not.toContain('l')
  })

  it('does not collide across 2000 draws', () => {
    const seen = new Set(Array.from({ length: 2000 }, generateMeetingCode))
    expect(seen.size).toBe(2000)
  })
})

describe('normalizeMeetingCode', () => {
  it('accepts the canonical form', () => {
    expect(normalizeMeetingCode('kxv-nvra-dwq')).toBe('kxvnvradwq')
  })

  it('accepts uppercase and spaces', () => {
    expect(normalizeMeetingCode('KXV NVRA DWQ')).toBe('kxvnvradwq')
  })

  it('accepts a bare run of letters', () => {
    expect(normalizeMeetingCode('kxvnvradwq')).toBe('kxvnvradwq')
  })

  it('rejects the excluded letter', () => {
    expect(normalizeMeetingCode('lxv-nvra-dwq')).toBeNull()
  })

  it('rejects the wrong length', () => {
    expect(normalizeMeetingCode('kxv-nvra-dw')).toBeNull()
    expect(normalizeMeetingCode('kxv-nvra-dwqq')).toBeNull()
  })

  it('rejects digits', () => {
    expect(normalizeMeetingCode('kx1-nvra-dwq')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(normalizeMeetingCode('')).toBeNull()
  })
})

describe('round trip', () => {
  it('formats a normalized code back to the generated shape', () => {
    const code = generateMeetingCode()
    const normalized = normalizeMeetingCode(code)
    expect(normalized).not.toBeNull()
    expect(formatMeetingCode(normalized as string)).toBe(code)
  })
})
