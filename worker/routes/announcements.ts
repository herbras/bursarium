// /announcements — top-level company announcements feed.
// Optional filters: dateFrom (YYYYMMDD), dateTo (YYYYMMDD), companyCode.
import { Hono } from 'hono'
import { and, eq, gte, lte, type SQL } from 'drizzle-orm'
import { getDb, schemas } from '../lib/db.ts'
import {
  getPagination,
  getTotalCount,
  paginatedEnvelope,
  parseDate
} from '../lib/helpers.ts'
import type { Env } from '../lib/types.ts'

export const announcementsRouter = new Hono<{ Bindings: Env }>()

announcementsRouter.get('/', async (c) => {
  const q = c.req.query()
  const { limit, offset, includeTotal } = getPagination(q)
  const dateFrom = q.dateFrom ? parseDate(q.dateFrom) : null
  const dateTo = q.dateTo ? parseDate(q.dateTo) : null
  const companyCode = q.companyCode?.trim()

  const conds: SQL[] = []
  if (dateFrom !== null) conds.push(gte(schemas.companyAnnouncement.date, dateFrom))
  if (dateTo !== null) conds.push(lte(schemas.companyAnnouncement.date, dateTo))
  if (companyCode) conds.push(eq(schemas.companyAnnouncement.companyCode, companyCode.toUpperCase()))
  const where = conds.length > 0 ? and(...conds) : undefined

  const db = getDb(c.env.DB)
  const baseQuery = db.select().from(schemas.companyAnnouncement)
  const dataQuery = (where ? baseQuery.where(where) : baseQuery).limit(limit).offset(offset)
  const [data, total] = await Promise.all([
    dataQuery,
    includeTotal ? getTotalCount(db, schemas.companyAnnouncement, where) : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})
