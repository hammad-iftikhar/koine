import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')

// rgba() with a plain white or black channel is how translucent glass is written
// and is allowed. A hex literal is a colour that escaped the token file.
const HEX = /#[0-9a-fA-F]{3,8}\b/g

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
