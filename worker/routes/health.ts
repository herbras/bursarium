import { Hono } from 'hono'
import type { Env } from '../lib/types.ts'

export const healthRouter = new Hono<{ Bindings: Env }>()

healthRouter.get('/', async (c) => {
  // Optional: ping D1 to confirm binding works
  let dbOk = false
  try {
    const result = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    dbOk = result?.ok === 1
  } catch (_err) {
    dbOk = false
  }
  return c.json({ status: 'ok', db: dbOk ? 'ok' : 'unreachable' })
})
