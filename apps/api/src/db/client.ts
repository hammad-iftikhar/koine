import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

// max: 10 per process. Every API instance holds its own pool, so this number
// multiplies by instance count — see spec module 08 on PgBouncer.
export const sql = postgres(url, { max: 10 })
export const db = drizzle(sql, { schema })
