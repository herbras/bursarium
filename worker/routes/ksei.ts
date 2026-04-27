// /ksei/* — Ownership intelligence built on KSEI monthly snapshots.
//
// Endpoints:
//   GET /ksei/ownership/:code           latest snapshot for one ticker
//   GET /ksei/ownership/:code/history   time-series for one ticker
//   GET /ksei/foreign-flow              latest with biggest MoM foreign delta
//   GET /ksei/top-foreign-owned         ranked by foreign% on latest snapshot
//   GET /ksei/snapshots                 list of available report dates
import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, schemas } from '../lib/db.ts'
import { getPagination, paginatedEnvelope } from '../lib/helpers.ts'
import type { Env } from '../lib/types.ts'

export const kseiRouter = new Hono<{ Bindings: Env }>()

// List available snapshot dates (epoch ms, descending).
kseiRouter.get('/snapshots', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db
    .selectDistinct({ reportDate: schemas.kseiOwnership.reportDate })
    .from(schemas.kseiOwnership)
    .orderBy(desc(schemas.kseiOwnership.reportDate))
    .limit(120) // 10 years of months
  return c.json({ data: rows.map((r) => ({ reportDate: r.reportDate, iso: new Date(r.reportDate).toISOString().split('T')[0] })) })
})

// Single ticker — latest snapshot.
kseiRouter.get('/ownership/:code', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(schemas.kseiOwnership)
    .where(eq(schemas.kseiOwnership.code, code))
    .orderBy(desc(schemas.kseiOwnership.reportDate))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: `no KSEI snapshot for ${code}` }, 404)

  // Compute derived fields for convenience
  const total = (row.localTotal ?? 0) + (row.foreignTotal ?? 0) || row.totalShares
  const foreignPct = total ? ((row.foreignTotal ?? 0) / total) * 100 : 0
  const localPct = total ? ((row.localTotal ?? 0) / total) * 100 : 0
  return c.json({
    data: {
      ...row,
      foreignPercent: Number(foreignPct.toFixed(4)),
      localPercent: Number(localPct.toFixed(4))
    }
  })
})

// Single ticker — full history.
kseiRouter.get('/ownership/:code/history', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const { limit, offset } = getPagination(c.req.query())
  const data = await db
    .select()
    .from(schemas.kseiOwnership)
    .where(eq(schemas.kseiOwnership.code, code))
    .orderBy(desc(schemas.kseiOwnership.reportDate))
    .limit(limit)
    .offset(offset)
  return c.json(paginatedEnvelope(data, { limit, offset }))
})

// Top tickers by foreign ownership % on the latest snapshot (default).
// Optional ?date=YYYYMMDD picks a specific snapshot.
kseiRouter.get('/top-foreign-owned', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = getPagination(c.req.query())
  const dateParam = c.req.query('date')

  // Resolve target reportDate.
  let reportDate: number | null
  if (dateParam && /^\d{8}$/.test(dateParam)) {
    reportDate = Date.UTC(
      Number(dateParam.slice(0, 4)),
      Number(dateParam.slice(4, 6)) - 1,
      Number(dateParam.slice(6, 8))
    )
  } else {
    const latest = await db
      .select({ reportDate: schemas.kseiOwnership.reportDate })
      .from(schemas.kseiOwnership)
      .orderBy(desc(schemas.kseiOwnership.reportDate))
      .limit(1)
    reportDate = latest[0]?.reportDate ?? null
  }
  if (!reportDate) return c.json({ data: [], meta: { limit, offset, total: 0 } })

  const where = and(
    eq(schemas.kseiOwnership.reportDate, reportDate),
    eq(schemas.kseiOwnership.type, 'EQUITY')
  )

  // Sort by foreign / (local+foreign) desc; D1 doesn't index expressions, but
  // dataset is ~3700 rows so a full scan is fine.
  const data = await db
    .select()
    .from(schemas.kseiOwnership)
    .where(where)
    .orderBy(
      desc(
        sql`CASE WHEN (COALESCE(${schemas.kseiOwnership.localTotal},0) + COALESCE(${schemas.kseiOwnership.foreignTotal},0)) = 0
            THEN 0
            ELSE COALESCE(${schemas.kseiOwnership.foreignTotal},0) * 1.0 /
                 (COALESCE(${schemas.kseiOwnership.localTotal},0) + COALESCE(${schemas.kseiOwnership.foreignTotal},0))
            END`
      )
    )
    .limit(limit)
    .offset(offset)

  return c.json({
    data: data.map((row) => {
      const total = (row.localTotal ?? 0) + (row.foreignTotal ?? 0) || row.totalShares
      const foreignPct = total ? ((row.foreignTotal ?? 0) / total) * 100 : 0
      return { code: row.code, name: row.code, foreignPercent: Number(foreignPct.toFixed(4)), foreignTotal: row.foreignTotal, localTotal: row.localTotal, totalShares: row.totalShares, reportDate: row.reportDate }
    }),
    meta: { limit, offset, reportDate }
  })
})

// Top tickers ranked by share of one specific investor type (e.g. mutual
// funds, pension funds, individuals). Useful for "who owns the most BBCA-like
// stocks via reksa dana" or "biggest pension-fund holdings on IDX".
//
//   GET /ksei/top-by-type?type=foreignMf&limit=20
//   type ∈ { local|foreign }{Is|Cp|Pf|Ib|Id|Mf|Sc|Fd|Ot}
//   Optional ?date=YYYYMMDD to pick an older snapshot (default = latest).
const VALID_TYPES = new Set([
  'localIs','localCp','localPf','localIb','localId','localMf','localSc','localFd','localOt',
  'foreignIs','foreignCp','foreignPf','foreignIb','foreignId','foreignMf','foreignSc','foreignFd','foreignOt'
])
kseiRouter.get('/top-by-type', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = getPagination(c.req.query())
  const type = c.req.query('type') ?? ''
  if (!VALID_TYPES.has(type)) {
    return c.json(
      { error: `type must be one of: ${Array.from(VALID_TYPES).join(', ')}` },
      400
    )
  }
  const dateParam = c.req.query('date')
  let reportDate: number | null
  if (dateParam && /^\d{8}$/.test(dateParam)) {
    reportDate = Date.UTC(
      Number(dateParam.slice(0, 4)),
      Number(dateParam.slice(4, 6)) - 1,
      Number(dateParam.slice(6, 8))
    )
  } else {
    const latest = await db
      .select({ reportDate: schemas.kseiOwnership.reportDate })
      .from(schemas.kseiOwnership)
      .orderBy(desc(schemas.kseiOwnership.reportDate))
      .limit(1)
    reportDate = latest[0]?.reportDate ?? null
  }
  if (!reportDate) return c.json({ data: [], meta: { limit, offset, type, total: 0 } })

  // biome-ignore lint/suspicious/noExplicitAny: dynamic column on schema
  const col = (schemas.kseiOwnership as any)[type]
  const data = await db
    .select()
    .from(schemas.kseiOwnership)
    .where(
      and(
        eq(schemas.kseiOwnership.reportDate, reportDate),
        eq(schemas.kseiOwnership.type, 'EQUITY')
      )
    )
    .orderBy(desc(col))
    .limit(limit)
    .offset(offset)

  return c.json({
    data: data.map((row) => {
      const total = (row.localTotal ?? 0) + (row.foreignTotal ?? 0) || row.totalShares
      // biome-ignore lint/suspicious/noExplicitAny: dynamic field access
      const value = ((row as any)[type] ?? 0) as number
      const pctOfTotal = total ? (value / total) * 100 : 0
      return {
        code: row.code,
        type,
        value,
        pctOfTotal: Number(pctOfTotal.toFixed(4)),
        totalShares: row.totalShares,
        foreignTotal: row.foreignTotal,
        localTotal: row.localTotal
      }
    }),
    meta: { limit, offset, type, reportDate }
  })
})

// Find tickers with the most similar SHAREHOLDER PROFILE — same mix of
// investor types holding similar shares. KSEI's public data is
// aggregate-only (no named investors), so this surfaces *behavioural*
// neighbours: stocks that the same kind of investor tends to own.
//
// Method: build an 18-D vector per ticker from the 9 local + 9 foreign
// type columns, normalize to share-of-total (so ticker size doesn't
// dominate), then cosine similarity vs the target.
//
//   GET /ksei/similar/:code?limit=10
const TYPE_COLS = [
  'localIs','localCp','localPf','localIb','localId','localMf','localSc','localFd','localOt',
  'foreignIs','foreignCp','foreignPf','foreignIb','foreignId','foreignMf','foreignSc','foreignFd','foreignOt'
] as const

function compositionVector(row: Record<string, number | null>): number[] {
  const total = (row.localTotal ?? 0) + (row.foreignTotal ?? 0)
  if (total <= 0) return new Array(TYPE_COLS.length).fill(0)
  return TYPE_COLS.map((c) => (row[c] ?? 0) / total)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

kseiRouter.get('/similar/:code', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const db = getDb(c.env.DB)
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query('limit') ?? '10', 10)))

  const latest = await db
    .select({ reportDate: schemas.kseiOwnership.reportDate })
    .from(schemas.kseiOwnership)
    .orderBy(desc(schemas.kseiOwnership.reportDate))
    .limit(1)
  const reportDate = latest[0]?.reportDate
  if (!reportDate) return c.json({ data: [], meta: { code, total: 0 } })

  const rows = await db
    .select()
    .from(schemas.kseiOwnership)
    .where(
      and(
        eq(schemas.kseiOwnership.reportDate, reportDate),
        eq(schemas.kseiOwnership.type, 'EQUITY')
      )
    )

  const target = rows.find((r) => r.code === code)
  if (!target) return c.json({ error: `no KSEI snapshot for ${code}` }, 404)

  // biome-ignore lint/suspicious/noExplicitAny: row is dynamic schema
  const targetVec = compositionVector(target as any)
  const targetTotal = (target.localTotal ?? 0) + (target.foreignTotal ?? 0) || target.totalShares
  const targetForeignPct = targetTotal ? ((target.foreignTotal ?? 0) / targetTotal) * 100 : 0

  const ranked = rows
    .filter((r) => r.code !== code)
    .map((r) => {
      // biome-ignore lint/suspicious/noExplicitAny: row is dynamic schema
      const vec = compositionVector(r as any)
      const sim = cosineSim(targetVec, vec)
      const total = (r.localTotal ?? 0) + (r.foreignTotal ?? 0) || r.totalShares
      const foreignPct = total ? ((r.foreignTotal ?? 0) / total) * 100 : 0
      return {
        code: r.code,
        similarity: Number(sim.toFixed(4)),
        foreignPercent: Number(foreignPct.toFixed(2)),
        totalShares: r.totalShares,
        price: r.price ?? null
      }
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return c.json({
    data: ranked,
    meta: {
      code,
      reportDate,
      targetForeignPercent: Number(targetForeignPct.toFixed(2)),
      // Herfindahl-like concentration: sum of squared shares. Higher = more
      // concentrated holding profile (closer to 1 = single-type dominance).
      concentration: Number(
        targetVec.reduce((s, v) => s + v * v, 0).toFixed(4)
      )
    }
  })
})

// Foreign flow: top tickers by absolute change in foreign ownership between
// the two latest snapshots. Default returns top 50 by absolute delta.
kseiRouter.get('/foreign-flow', async (c) => {
  const db = getDb(c.env.DB)
  const { limit, offset } = getPagination(c.req.query())

  const dates = await db
    .selectDistinct({ reportDate: schemas.kseiOwnership.reportDate })
    .from(schemas.kseiOwnership)
    .orderBy(desc(schemas.kseiOwnership.reportDate))
    .limit(2)

  if (dates.length < 2) {
    return c.json({ error: 'need at least 2 KSEI snapshots to compute flow' }, 400)
  }
  const latest = dates[0]?.reportDate
  const previous = dates[1]?.reportDate
  if (!latest || !previous) {
    return c.json({ error: 'snapshot dates missing' }, 500)
  }

  // Pull both snapshots, merge in JS (D1 LEFT JOIN with self requires care).
  const [latestRows, prevRows] = await Promise.all([
    db
      .select({
        code: schemas.kseiOwnership.code,
        foreignTotal: schemas.kseiOwnership.foreignTotal,
        localTotal: schemas.kseiOwnership.localTotal,
        totalShares: schemas.kseiOwnership.totalShares
      })
      .from(schemas.kseiOwnership)
      .where(
        and(eq(schemas.kseiOwnership.reportDate, latest), eq(schemas.kseiOwnership.type, 'EQUITY'))
      ),
    db
      .select({
        code: schemas.kseiOwnership.code,
        foreignTotal: schemas.kseiOwnership.foreignTotal
      })
      .from(schemas.kseiOwnership)
      .where(
        and(eq(schemas.kseiOwnership.reportDate, previous), eq(schemas.kseiOwnership.type, 'EQUITY'))
      )
  ])

  const prevByCode = new Map(prevRows.map((r) => [r.code, r.foreignTotal ?? 0]))
  const flows = latestRows
    .map((r) => {
      const f0 = prevByCode.get(r.code) ?? 0
      const f1 = r.foreignTotal ?? 0
      const delta = f1 - f0
      const total = (r.localTotal ?? 0) + f1 || r.totalShares
      return {
        code: r.code,
        foreignDelta: delta,
        foreignBefore: f0,
        foreignAfter: f1,
        foreignPercent: total ? Number(((f1 / total) * 100).toFixed(4)) : 0
      }
    })
    .sort((a, b) => Math.abs(b.foreignDelta) - Math.abs(a.foreignDelta))
    .slice(offset, offset + limit)

  return c.json({
    data: flows,
    meta: { limit, offset, latestDate: latest, previousDate: previous }
  })
})
