// Diagnostic endpoints — smoke tests for the Workers migration.
//
// IMPORTANT: gate behind DIAG_TOKEN env var so they're not abused if
// accidentally left enabled in production. If DIAG_TOKEN is unset, the
// router 404s every request — the endpoints are effectively disabled.
//
// Usage:
//   curl 'https://idx-api.workers.dev/_test/idx-fetch?token=...'
//   curl 'https://idx-api.workers.dev/_test/run-sync?token=...&kind=indexList'
//   curl 'https://idx-api.workers.dev/_test/dataset-size?token=...'

import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { syncIndexList } from '../sync/index-list.ts'
import type { Env } from '../lib/types.ts'

export const diagnosticsRouter = new Hono<{ Bindings: Env & { DIAG_TOKEN?: string } }>()

// Auth middleware — checks ?token=... against DIAG_TOKEN secret.
diagnosticsRouter.use('*', async (c, next) => {
  const expected = c.env.DIAG_TOKEN
  if (!expected) {
    return c.json({ error: 'diagnostics disabled' }, 404)
  }
  const provided = c.req.query('token')
  if (provided !== expected) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
})

// ---- 1. IP egress test ----
// Calls IDX endpoints directly from this Worker. Reports timing, status,
// cookies issued, and a snippet of response body. The point: see whether
// IDX accepts requests from Cloudflare's egress IP range.
diagnosticsRouter.get('/idx-fetch', async (c) => {
  const baseUrl = c.env.IDX_BASE_URL
  const checks: DiagnosticCheck[] = []

  checks.push(await diagFetch(`${baseUrl}/id`, 'home page'))
  checks.push(
    await diagFetch(`${baseUrl}/primary/home/GetIndexList`, 'index list endpoint', {
      'X-Requested-With': 'XMLHttpRequest'
    })
  )

  const allOk = checks.every((c) => c.ok)
  const blocked = checks.some((c) => c.status === 403 || c.status === 401 || c.status === 451)
  const status = allOk ? 'ok' : blocked ? 'blocked' : 'partial'

  return c.json({
    summary: status,
    interpretation:
      status === 'ok'
        ? 'IDX accepts requests from Cloudflare egress. Migration viable.'
        : status === 'blocked'
          ? 'IDX appears to block CF egress. Pivot to hybrid VPS or Workflows.'
          : 'Mixed signals — inspect each check below.',
    checks
  })
})

// ---- 2. Manual sync trigger ----
// Invokes a sync directly (bypassing the queue), so you can see what one
// sync looks like end-to-end without waiting for cron + queue dispatch.
// Currently only `kind=indexList` is wired (the only ported sync).
diagnosticsRouter.get('/run-sync', async (c) => {
  const kind = c.req.query('kind') ?? 'indexList'
  const start = Date.now()
  const client = new IdxClient(c.env.IDX_BASE_URL)

  try {
    if (kind === 'indexList') {
      const result = await syncIndexList(c.env.DB, client)
      return c.json({
        kind,
        status: 'ok',
        durationMs: Date.now() - start,
        result
      })
    }
    return c.json({ error: `kind '${kind}' not yet ported. Available: indexList` }, 400)
  } catch (err) {
    return c.json(
      {
        kind,
        status: 'error',
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err)
      },
      500
    )
  }
})

// ---- 3. Dataset size ----
// Queries D1 for row counts per table + reports against free-tier limits.
// Useful to gauge whether the dataset will fit within D1 5GB free or
// require paid tier ($5/mo).
diagnosticsRouter.get('/dataset-size', async (c) => {
  const db = getDb(c.env.DB)
  const tableNames = Object.keys(schemas).filter((k) => {
    // biome-ignore lint/suspicious/noExplicitAny: schema export is a typeof bag
    const t = (schemas as Record<string, any>)[k]
    return t && typeof t === 'object' && '_' in t && t._.brand === 'Table'
  })

  const counts: Record<string, number | string> = {}
  for (const name of tableNames) {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic table lookup
      const table = (schemas as Record<string, any>)[name]
      const tableName = table[Symbol.for('drizzle:Name')] ?? name
      const result = await db.run(sql.raw(`SELECT COUNT(*) AS c FROM ${tableName}`))
      // D1 returns { results: [{ c: number }], ... }
      // biome-ignore lint/suspicious/noExplicitAny: D1 result shape
      const row = (result.results?.[0] ?? {}) as any
      counts[name] = typeof row.c === 'number' ? row.c : 0
    } catch (err) {
      counts[name] = `err: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const totalRows = Object.values(counts).reduce<number>(
    (sum, v) => sum + (typeof v === 'number' ? v : 0),
    0
  )

  return c.json({
    summary: 'D1 row counts by table',
    tableCount: tableNames.length,
    totalRows,
    freeTierLimit: '5 GB storage / 5M reads/day / 100K writes/day',
    interpretation:
      totalRows < 1_000_000
        ? 'Well under free tier. Stay on D1 free.'
        : totalRows < 10_000_000
          ? 'Approaching limits. Monitor write volume.'
          : 'Likely needs paid D1 ($5/mo) or Turso.',
    counts
  })
})

// ---- helpers ----
interface DiagnosticCheck {
  url: string
  label: string
  status: number
  ok: boolean
  durationMs: number
  bodySnippet: string
  cookies: string[]
  contentType: string | null
  cfRay: string | null
  cfBlockHeaders: Record<string, string>
}

async function diagFetch(
  url: string,
  label: string,
  extraHeaders: Record<string, string> = {}
): Promise<DiagnosticCheck> {
  const start = Date.now()
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    Referer: 'https://www.idx.co.id/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    ...extraHeaders
  }

  try {
    const response = await fetch(url, { headers })
    const text = await response.text()
    const cookies: string[] = []
    const cfHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (lower === 'set-cookie') cookies.push(value)
      if (lower.startsWith('cf-') || lower === 'server') cfHeaders[lower] = value
    })

    return {
      url,
      label,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - start,
      bodySnippet: text.slice(0, 200),
      cookies,
      contentType: response.headers.get('content-type'),
      cfRay: response.headers.get('cf-ray'),
      cfBlockHeaders: cfHeaders
    }
  } catch (err) {
    return {
      url,
      label,
      status: 0,
      ok: false,
      durationMs: Date.now() - start,
      bodySnippet: `network error: ${err instanceof Error ? err.message : String(err)}`,
      cookies: [],
      contentType: null,
      cfRay: null,
      cfBlockHeaders: {}
    }
  }
}
