import type { MeResponse } from '@koine/shared'
import type { FastifyRequest } from 'fastify'
import { getSession } from '../../auth'

export async function getMe(request: FastifyRequest): Promise<MeResponse> {
  const result = await getSession(request)
  if (!result?.user) return { user: null }

  const { id, name, email, image } = result.user
  return { user: { id, name, email, image: image ?? null } }
}
