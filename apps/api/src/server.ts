import { buildApp } from './app'

const rawPort = process.env.PORT ?? '3000'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`api: invalid PORT "${rawPort}" — set PORT to an integer between 1 and 65535`)
  process.exit(1)
}

const app = await buildApp()
await app.listen({ port, host: '0.0.0.0' })
console.log(`api listening on ${port}`)
