import { expect, it } from 'vitest'
import { webOrigins } from './origins'

it('parses a comma-separated list and trims whitespace', () => {
  expect(webOrigins(' http://localhost:5173 , http://localhost:4173 ')).toEqual([
    'http://localhost:5173',
    'http://localhost:4173',
  ])
})

it('drops empty entries from a trailing or doubled comma', () => {
  expect(webOrigins('http://localhost:5173,,')).toEqual(['http://localhost:5173'])
})

it('falls back to the localhost dev origins when unset', () => {
  expect(webOrigins(undefined)).toContain('http://localhost:5173')
})

it('refuses a wildcard entry instead of widening to every origin', () => {
  // @fastify/cors throws the whole allow-list away and uses '*' if any entry
  // is '*'. With credentials: true that is a CSRF hole, and `WEB_ORIGIN=*` is
  // a plausible ops shortcut, so it has to fail loudly at boot.
  expect(() => webOrigins('http://localhost:5173,*')).toThrow(/must not contain/)
  expect(() => webOrigins('*')).toThrow(/must not contain/)
})

it('refuses a list that is set but empty', () => {
  expect(() => webOrigins('  ')).toThrow(/lists no origins/)
})
