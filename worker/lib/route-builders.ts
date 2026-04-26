// Route factories — DRY builders for the 4 list patterns IDX uses.
//
// Patterns:
//   1. plain  — paginated list, no filter (e.g. /participants/brokers)
//   2. period — paginated list, filter by year*100+month (e.g. /trading/foreign?year=2026&month=2)
//   3. date   — paginated list, filter by single YYYYMMDD day (e.g. /trading/stock-summary?date=20260224)
//   4. code   — paginated list, filter by `:code` URL param (e.g. /trading/company/BBCA/daily)
//
// Each builder returns a Hono router with a single `GET /` handler.
// Mount under the appropriate path in routes/{group}.ts.

import { Hono } from 'hono'
import { and, asc, desc, eq, gte, lt, type AnyColumn, type SQL } from 'drizzle-orm'
import { getDb } from './db.ts'
import {
  getPagination,
  getTotalCount,
  monthToPeriod,
  paginatedEnvelope,
  parseDate
} from './helpers.ts'
import type { Env } from './types.ts'

// biome-ignore lint/suspicious/noExplicitAny: Drizzle's SQLiteTable<...> is generic-heavy
type Table = any

interface OrderBy {
  column: AnyColumn
  direction: 'asc' | 'desc'
}

export function plainListRouter(table: Table): Hono<{ Bindings: Env }> {
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

export function periodListRouter(table: Table, periodColumn: AnyColumn): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>()
  router.get('/', async (c) => {
    const q = c.req.query()
    const year = Number.parseInt(q.year ?? '', 10)
    const month = Number.parseInt(q.month ?? '', 10)
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return c.json({ error: 'Query "year" and "month" (1-12) required' }, 400)
    }
    const db = getDb(c.env.DB)
    const { limit, offset, includeTotal } = getPagination(q)
    const where = eq(periodColumn, monthToPeriod(year, month))
    const [data, total] = await Promise.all([
      db.select().from(table).where(where).limit(limit).offset(offset),
      includeTotal ? getTotalCount(db, table, where) : Promise.resolve(undefined)
    ])
    const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
    return c.json(paginatedEnvelope(data, meta))
  })
  return router
}

// Filters rows where `dateColumn` (epoch milliseconds) falls within the
// requested YYYYMMDD day in UTC. Matches upstream's approach.
export function dateRangeListRouter(table: Table, dateColumn: AnyColumn): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>()
  router.get('/', async (c) => {
    const q = c.req.query()
    const dateParam = q.date
    if (!dateParam) {
      return c.json({ error: 'Query "date" (YYYYMMDD) required' }, 400)
    }
    const dateTs = parseDate(dateParam)
    if (dateTs === null) {
      return c.json({ error: 'Invalid date format; use YYYYMMDD' }, 400)
    }
    const dayStartMs = dateTs * 1000
    const dayEndMs = (dateTs + 86400) * 1000
    const db = getDb(c.env.DB)
    const { limit, offset, includeTotal } = getPagination(q)
    const where = and(gte(dateColumn, dayStartMs), lt(dateColumn, dayEndMs))
    const [data, total] = await Promise.all([
      db.select().from(table).where(where).limit(limit).offset(offset),
      includeTotal ? getTotalCount(db, table, where) : Promise.resolve(undefined)
    ])
    const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
    return c.json(paginatedEnvelope(data, meta))
  })
  return router
}

export function byCodeListRouter(
  table: Table,
  codeColumn: AnyColumn,
  options: { orderBy?: OrderBy; uppercase?: boolean } = {}
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>()
  router.get('/', async (c) => {
    const raw = c.req.param('code')
    if (!raw) {
      return c.json({ error: 'Missing code' }, 400)
    }
    const code = options.uppercase === false ? raw : raw.toUpperCase()
    const db = getDb(c.env.DB)
    const { limit, offset, includeTotal } = getPagination(c.req.query())
    const where = eq(codeColumn, code) as SQL
    let dataQuery = db.select().from(table).where(where)
    if (options.orderBy) {
      const { column, direction } = options.orderBy
      // biome-ignore lint/suspicious/noExplicitAny: drizzle builder narrowing
      dataQuery = (dataQuery as any).orderBy(direction === 'desc' ? desc(column) : asc(column))
    }
    const [data, total] = await Promise.all([
      dataQuery.limit(limit).offset(offset),
      includeTotal ? getTotalCount(db, table, where) : Promise.resolve(undefined)
    ])
    const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
    return c.json(paginatedEnvelope(data, meta))
  })
  return router
}
