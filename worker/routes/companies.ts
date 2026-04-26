import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, schemas } from '../lib/db.ts'
import { getPagination, getTotalCount, paginatedEnvelope } from '../lib/helpers.ts'
import type { Env } from '../lib/types.ts'

export const companiesRouter = new Hono<{ Bindings: Env }>()

// GET /companies — paginated listing
companiesRouter.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset, includeTotal } = getPagination(c.req.query())
  const dataPromise = db.select().from(schemas.companyProfile).limit(limit).offset(offset)
  const [data, total] = await Promise.all([
    dataPromise,
    includeTotal ? getTotalCount(db, schemas.companyProfile) : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})

// GET /companies/:code — single company detail
companiesRouter.get('/:code', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const [profile, detail] = await Promise.all([
    db.select().from(schemas.companyProfile).where(eq(schemas.companyProfile.code, code)).limit(1),
    db.select().from(schemas.companyDetail).where(eq(schemas.companyDetail.code, code)).limit(1)
  ])
  const profileRow = profile[0]
  if (!profileRow) {
    return c.json({ error: 'company not found' }, 404)
  }
  return c.json({ data: { ...profileRow, detail: detail[0] ?? null } })
})

// GET /companies/:code/announcements
companiesRouter.get('/:code/announcements', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const { limit, offset, includeTotal } = getPagination(c.req.query())
  const where = eq(schemas.companyAnnouncement.companyCode, code)
  const [data, total] = await Promise.all([
    db
      .select()
      .from(schemas.companyAnnouncement)
      .where(where)
      .limit(limit)
      .offset(offset),
    includeTotal
      ? getTotalCount(db, schemas.companyAnnouncement, where)
      : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})

// GET /companies/:code/financial-reports
companiesRouter.get('/:code/financial-reports', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const { limit, offset, includeTotal } = getPagination(c.req.query())
  const where = eq(schemas.financialReport.code, code)
  const [data, total] = await Promise.all([
    db
      .select()
      .from(schemas.financialReport)
      .where(where)
      .limit(limit)
      .offset(offset),
    includeTotal ? getTotalCount(db, schemas.financialReport, where) : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})

// GET /companies/:code/issued-history
companiesRouter.get('/:code/issued-history', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const { limit, offset, includeTotal } = getPagination(c.req.query())
  const where = eq(schemas.issuedHistory.code, code)
  const [data, total] = await Promise.all([
    db.select().from(schemas.issuedHistory).where(where).limit(limit).offset(offset),
    includeTotal ? getTotalCount(db, schemas.issuedHistory, where) : Promise.resolve(undefined)
  ])
  const meta = total !== undefined ? { limit, offset, total } : { limit, offset }
  return c.json(paginatedEnvelope(data, meta))
})
