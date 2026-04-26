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
import { IdxClient } from '../lib/client.ts'
import { clearCachedCookies, getCachedCookies } from '../lib/cookie-cache.ts'
import { warmCookies } from '../lib/cookie-warmer.ts'
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
//
// Mirrors the consumer path: reads cached cookies from KV first.
diagnosticsRouter.get('/run-sync', async (c) => {
  const kind = c.req.query('kind') ?? 'indexList'
  const start = Date.now()
  const cached = await getCachedCookies(c.env.COOKIE_KV)
  const client = new IdxClient(c.env.IDX_BASE_URL, cached?.cookieHeader ?? '')

  try {
    if (kind === 'indexList') {
      const result = await syncIndexList(c.env.DB, client)
      return c.json({
        kind,
        status: 'ok',
        durationMs: Date.now() - start,
        usedCachedCookies: cached !== null,
        cookieSource: cached?.source,
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

// ---- Cookie cache: status (read-only) ----
diagnosticsRouter.get('/cookie-status', async (c) => {
  const cached = await getCachedCookies(c.env.COOKIE_KV)
  if (!cached) {
    return c.json({
      cached: false,
      hasKv: c.env.COOKIE_KV !== undefined,
      hasBrowser: c.env.BROWSER !== undefined,
      message: 'no cached cookies'
    })
  }
  const ageMs = Date.now() - cached.obtainedAt
  const ttlRemainingMs = cached.expiresAt - Date.now()
  return c.json({
    cached: true,
    source: cached.source,
    ageMs,
    ttlRemainingMs,
    cookieCount: cached.cookieHeader.split(';').filter(Boolean).length,
    cookieNames: cached.cookieHeader
      .split(';')
      .map((s) => s.trim().split('=')[0])
      .filter(Boolean),
    hasKv: true,
    hasBrowser: c.env.BROWSER !== undefined
  })
})

// ---- Cookie cache: warm now (writes to KV) ----
// Forces a fresh warm regardless of cache state. Useful to validate
// that BROWSER binding works and to compare workers-fetch vs browser
// cookie quality.
diagnosticsRouter.get('/warm-cookies', async (c) => {
  try {
    const result = await warmCookies(c.env)
    return c.json({
      status: 'ok',
      source: result.source,
      durationMs: result.durationMs,
      cookieCount: result.cookieCount
    })
  } catch (err) {
    return c.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      },
      500
    )
  }
})

// ---- Cookie cache: clear (for testing miss path) ----
diagnosticsRouter.delete('/cookie-status', async (c) => {
  await clearCachedCookies(c.env.COOKIE_KV)
  return c.json({ status: 'cleared' })
})

// ---- 3. Dataset size ----
// Queries D1 for row counts per table + reports against free-tier limits.
// Useful to gauge whether the dataset will fit within D1 5GB free or
// require paid tier ($5/mo).
diagnosticsRouter.get('/dataset-size', async (c) => {
  // Source of truth: sqlite_master (avoid Drizzle introspection quirks).
  // Filter out internal D1/SQLite tables we don't have permission to read.
  const tablesQ = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name"
  ).all<{ name: string }>()

  const counts: Record<string, number | string> = {}
  for (const row of tablesQ.results ?? []) {
    const name = row.name
    try {
      // Whitelist via sqlite_master query above — safe to interpolate.
      const result = await c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM "${name}"`
      ).first<{ c: number }>()
      counts[name] = typeof result?.c === 'number' ? result.c : 0
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
    tableCount: Object.keys(counts).length,
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
