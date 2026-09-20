import { beforeAll, expect, it } from 'vitest'
import { mintAccessToken } from '../src/livekit'

function claims(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1] as string
  return JSON.parse(Buffer.from(payload, 'base64url').toString())
}

beforeAll(() => {
  process.env.LIVEKIT_API_KEY ??= 'devkey'
  process.env.LIVEKIT_API_SECRET ??= 'devsecret_change_me_at_least_32_chars'
})

it('scopes the grant to exactly one room', async () => {
  const jwt = await mintAccessToken({ room: 'kxvnvradwq', identity: 'p_1', name: 'Mariam' })
  const video = claims(jwt).video as Record<string, unknown>

  // The trust boundary: a token for room A must not name room B, and must not
  // carry roomCreate or roomAdmin, which would let a guest reshape the room.
  expect(video.room).toBe('kxvnvradwq')
  expect(video.roomJoin).toBe(true)
  expect(video.roomCreate).toBeUndefined()
  expect(video.roomAdmin).toBeUndefined()
})

it('binds the identity so a token is not transferable', async () => {
  const jwt = await mintAccessToken({ room: 'kxvnvradwq', identity: 'p_1', name: 'Mariam' })
  expect(claims(jwt).sub).toBe('p_1')
})

it('expires', async () => {
  const jwt = await mintAccessToken({ room: 'kxvnvradwq', identity: 'p_1', name: 'Mariam' })
  const exp = claims(jwt).exp as number
  expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  expect(exp).toBeLessThan(Math.floor(Date.now() / 1000) + 60 * 60 * 24)
})

it('marks an agent hidden so it does not render as a tile', async () => {
  const jwt = await mintAccessToken({
    room: 'kxvnvradwq',
    identity: 'agent',
    name: 'agent',
    hidden: true,
  })
  expect((claims(jwt).video as Record<string, unknown>).hidden).toBe(true)
})

it('rejects when credentials are unset', async () => {
  const savedKey = process.env.LIVEKIT_API_KEY
  const savedSecret = process.env.LIVEKIT_API_SECRET
  try {
    delete process.env.LIVEKIT_API_KEY
    delete process.env.LIVEKIT_API_SECRET
    await expect(mintAccessToken({ room: 'test', identity: 'test', name: 'test' })).rejects.toThrow(
      'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set',
    )
  } finally {
    process.env.LIVEKIT_API_KEY = savedKey
    process.env.LIVEKIT_API_SECRET = savedSecret
  }
})
