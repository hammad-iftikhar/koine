import { AccessToken } from 'livekit-server-sdk'

const TTL_SECONDS = 60 * 60 * 4

export async function mintAccessToken(opts: {
  room: string
  identity: string
  name: string
  hidden?: boolean
}): Promise<string> {
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!key || !secret) throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set')

  const token = new AccessToken(key, secret, {
    identity: opts.identity,
    name: opts.name,
    ttl: TTL_SECONDS,
  })

  // Deliberately narrow. No roomCreate, no roomAdmin, no roomList — a
  // participant needs none of them, and granting them makes every guest an
  // administrator of a room they merely joined.
  token.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    hidden: opts.hidden ?? false,
  })

  return token.toJwt()
}
