import { Hono } from 'hono'
import { and, eq, type SQL } from 'drizzle-orm'
import { getDb, schemas } from '../lib/db.ts'
import { getPagination, getTotalCount, paginatedEnvelope } from '../lib/helpers.ts'
import type { Env } from '../lib/types.ts'

export const securitiesRouter = new Hono<{ Bindings: Env }>()

securitiesRouter.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const q = c.req.query()
  const { limit, offset, includeTotal } = getPagination(q)
  const code = q.code?.trim()
  const board = q.board?.trim()

  const conditions: SQL[] = []
  if (code) conditions.push(eq(schemas.securityStock.code, code.toUpperCase()))
  if (board) conditions.push(eq(schemas.securityStock.listingBoard, board))
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const baseQuery = db.select().from(schemas.securityStock)
  const dataPromise = (where ? baseQuery.where(where) : baseQuery).limit(limit).offset(offset)
  const [data, total] = await Promise.all([
    dataPromise,
    includeTotal ? getTotalCount(db, schemas.securityStock, where) : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})
