// Simple paginated listing routes — same shape (no filters, no params).
// Bundled here to avoid 30+ tiny files for trivial endpoints.
import { Hono } from 'hono'
import { getDb, schemas } from '../lib/db.ts'
import { getPagination, getTotalCount, paginatedEnvelope } from '../lib/helpers.ts'
import type { Env } from '../lib/types.ts'

// biome-ignore lint/suspicious/noExplicitAny: drizzle table type is generic
type Table = any

function buildSimpleRouter(table: Table): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>()
  router.get('/', async (c) => {
    const db = getDb(c.env.DB)
    const { limit, offset, includeTotal } = getPagination(c.req.query())
    const [data, total] = await Promise.all([
      db.select().from(table).limit(limit).offset(offset),
      includeTotal ? getTotalCount(db, table) : Promise.resolve(undefined)
    ])
    const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
    return c.json(paginatedEnvelope(data, meta))
  })
  return router
}

export const stockScreenerRouter = buildSimpleRouter(schemas.stockScreener)
export const relistingRouter = buildSimpleRouter(schemas.companyRelisting)
export const suspendRouter = buildSimpleRouter(schemas.companySuspend)
