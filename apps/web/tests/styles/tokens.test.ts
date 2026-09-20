import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// This test reads component sources off disk, so it needs a real path, not
// the `@/` alias — the alias is a module specifier and resolves nothing here.
const COMPONENTS = join(import.meta.dirname, '..', '..', 'src', 'components')

// A hex literal is a colour that escaped the token file.
const HEX = /#[0-9a-fA-F]{3,8}\b/g

// rgb()/rgba() notation is another way a colour escapes the token file —
// e.g. `bg-[rgba(255,255,255,0.05)]` — and must be a token (`var(--tile)`,
// `var(--scrim)`, ...) instead, same as a hex literal would be.
const RGB_LITERAL = /rgba?\(/g

it('no component contains a hex colour literal', () => {
  const offenders: string[] = []

  for (const file of readdirSync(COMPONENTS)) {
    if (!file.endsWith('.tsx') || file.endsWith('.stories.tsx')) continue
    const source = readFileSync(join(COMPONENTS, file), 'utf8')
    const found = source.match(HEX)
    if (found) offenders.push(`${file}: ${found.join(', ')}`)
  }

  expect(offenders, `Move these into src/styles/tokens.css:\n${offenders.join('\n')}`).toEqual([])
})

it('no component contains an rgb()/rgba() colour literal', () => {
  const offenders: string[] = []

  for (const file of readdirSync(COMPONENTS)) {
    if (!file.endsWith('.tsx') || file.endsWith('.stories.tsx')) continue
    const source = readFileSync(join(COMPONENTS, file), 'utf8')
    const found = source.match(RGB_LITERAL)
    if (found) offenders.push(`${file}: ${found.join(', ')}`)
  }

  expect(offenders, `Move these into src/styles/tokens.css:\n${offenders.join('\n')}`).toEqual([])
})
