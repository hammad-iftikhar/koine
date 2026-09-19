import { z } from 'zod'

export const MeUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  image: z.string().nullable(),
})

export const MeResponse = z.object({ user: MeUser.nullable() })

export type MeUser = z.infer<typeof MeUser>
export type MeResponse = z.infer<typeof MeResponse>
