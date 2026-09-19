// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { isBlurEnabled, setBlurEnabled } from './perf'

beforeEach(() => {
  document.documentElement.removeAttribute('data-blur')
})

it('defaults to enabled', () => {
  expect(isBlurEnabled()).toBe(true)
})

it('stamps the root when disabled', () => {
  setBlurEnabled(false)
  expect(document.documentElement.dataset.blur).toBe('off')
  expect(isBlurEnabled()).toBe(false)
})

it('clears the stamp when re-enabled', () => {
  setBlurEnabled(false)
  setBlurEnabled(true)
  expect(document.documentElement.dataset.blur).toBeUndefined()
  expect(isBlurEnabled()).toBe(true)
})
