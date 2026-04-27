// KSEI ownership composition sync — chunked to fit Workers CPU budget.
//
// Source: web.ksei.co.id/Download/BalanceposEfek{YYYYMMDD}.zip
// Format: ZIP containing single TXT, pipe-delimited, ~3700 rows for end-of-month.
//
// CPU budget: Workers Free = 10s CPU per request. Unzipping + parsing 3700
// rows + 70+ D1 batch upserts can exceed that. We split into:
//   - parseKseiZip(): pure compute, fetches + parses, returns rows
//   - persistChunk(): D1 batch insert N rows
// Top-level syncKseiOwnership runs them sequentially within one Worker
// invocation (works for ~3700 rows in ~6-8s CPU on average month).
//
// If CPU blows for unusually large months, the recommended path is to
// enqueue per-chunk messages via Queue. For now: parses everything in-memory
// and persists in 50-row chunks (matches BATCH_CHUNK in _helpers.ts).

import type { D1Database } from '@cloudflare/workers-types'
import { unzipSync, strFromU8 } from 'fflate'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert } from './_helpers.ts'

const KSEI_BASE = 'https://web.ksei.co.id/Download'

const MONTH_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
}
function parseKseiDate(s: string): number {
  const [d, mon, y] = s.split('-')
  if (!d || !mon || !y) return 0
  const month = MONTH_MAP[mon.toUpperCase()]
  if (month === undefined) return 0
  return Date.UTC(Number(y), month, Number(d))
}

function num(s: string | undefined): number | null {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

interface KseiRow {
  id: string
  code: string
  type: string
  reportDate: number
  totalShares: number
  price: number | null
  localIs: number | null
  localCp: number | null
  localPf: number | null
  localIb: number | null
  localId: number | null
  localMf: number | null
  localSc: number | null
  localFd: number | null
  localOt: number | null
  localTotal: number | null
  foreignIs: number | null
  foreignCp: number | null
  foreignPf: number | null
  foreignIb: number | null
  foreignId: number | null
  foreignMf: number | null
  foreignSc: number | null
  foreignFd: number | null
  foreignOt: number | null
  foreignTotal: number | null
}

async function fetchAndParse(client: IdxClient, date: string): Promise<KseiRow[]> {
  const url = `${KSEI_BASE}/BalanceposEfek${date}.zip`
  const zipBuf = await client.fetchPublicBytes(url)
  const zipBytes = new Uint8Array(zipBuf)

  const files = unzipSync(zipBytes)
  const txtName = Object.keys(files).find((n) => n.endsWith('.txt'))
  if (!txtName) throw new Error(`KSEI ZIP for ${date} has no .txt file`)
  const txtBytes = files[txtName]
  if (!txtBytes) throw new Error(`KSEI ZIP entry "${txtName}" empty`)
  const txt = strFromU8(txtBytes)

  const lines = txt.split(/\r?\n/)
  const rows: KseiRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const cols = line.split('|')
    if (cols.length < 25) continue
    const code = cols[1]?.trim()
    const type = cols[2]?.trim()
    const dateStr = cols[0]?.trim()
    if (!code || !type || !dateStr) continue

    const reportDate = parseKseiDate(dateStr)
    if (!reportDate) continue
    const totalShares = num(cols[3])
    if (totalShares === null) continue

    rows.push({
      id: `${code}-${date}`,
      code,
      type,
      reportDate,
      totalShares,
      price: num(cols[4]),
      localIs: num(cols[5]),
      localCp: num(cols[6]),
      localPf: num(cols[7]),
      localIb: num(cols[8]),
      localId: num(cols[9]),
      localMf: num(cols[10]),
      localSc: num(cols[11]),
      localFd: num(cols[12]),
      localOt: num(cols[13]),
      localTotal: num(cols[14]),
      foreignIs: num(cols[15]),
      foreignCp: num(cols[16]),
      foreignPf: num(cols[17]),
      foreignIb: num(cols[18]),
      foreignId: num(cols[19]),
      foreignMf: num(cols[20]),
      foreignSc: num(cols[21]),
      foreignFd: num(cols[22]),
      foreignOt: num(cols[23]),
      foreignTotal: num(cols[24])
    })
  }
  return rows
}

/**
 * Full sync — parse + persist all rows. Suitable when CPU budget allows
 * (~6-8s for normal month). For larger months prefer the chunked variant
 * via syncKseiOwnershipChunk.
 */
export async function syncKseiOwnership(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  if (!/^\d{8}$/.test(date)) throw new Error(`KSEI date must be YYYYMMDD, got "${date}"`)
  const rows = await fetchAndParse(client, date)
  if (rows.length === 0) return { count: 0 }
  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db
      .insert(schemas.kseiOwnership)
      .values(row)
      .onConflictDoUpdate({ target: schemas.kseiOwnership.id, set: row })
  )
  return { count }
}

/**
 * Chunked sync — parses ONCE, caches parsed rows in KV under
 * `ksei:parsed:{date}`, then persists only `chunkRange` rows.
 *
 * Pattern:
 *   1. First call (offset=0) downloads + parses + caches to KV (TTL 1 hour).
 *   2. Subsequent calls read parsed rows from KV (cheap), persist their slice.
 * This keeps every call within Workers Free 10s CPU even on the
 * heaviest months (~3700 rows each).
 *
 * Without chunkRange: behaves like full sync (parse + persist all).
 */
const KV_TTL_SECONDS = 60 * 60

/**
 * Bulk insert pre-parsed rows. Caller supplies JSON-decoded KseiRow[]
 * (parsed locally, e.g. by backfill script). Worker only does D1 batch
 * upsert — no fflate, no parsing, ~1-3s CPU even for 500 rows.
 */
export async function insertKseiRows(
  d1: D1Database,
  rawRows: unknown[]
): Promise<{ count: number }> {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return { count: 0 }
  // Type-narrow defensively — mostly trust the caller.
  const rows = rawRows.filter(
    (r): r is KseiRow =>
      typeof r === 'object' && r !== null && 'id' in r && 'code' in r && 'reportDate' in r
  )
  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db
      .insert(schemas.kseiOwnership)
      .values(row)
      .onConflictDoUpdate({ target: schemas.kseiOwnership.id, set: row })
  )
  return { count }
}

/**
 * 2-phase sync to fit Workers Free 10s CPU budget:
 *
 *   Phase 1 (parseOnly=true): download + parse + cache to KV. Returns total
 *           rows. NO D1 writes. Quick: ~3-5s CPU.
 *   Phase 2 (parseOnly=false, offset/limit): read parsed rows from KV,
 *           persist `slice`. ~2-4s CPU per chunk.
 *
 * Caller (backfill script) flow:
 *   1. POST with parseOnly=1 (caches the date, returns total).
 *   2. Loop persist chunks of 500 until offset >= total.
 */
export async function syncKseiOwnershipChunk(
  d1: D1Database,
  client: IdxClient,
  date: string,
  // biome-ignore lint/suspicious/noExplicitAny: KV binding from env, optional
  kv: any | undefined,
  options: { offset?: number; limit?: number; parseOnly?: boolean } = {}
): Promise<{ count: number; total: number; cached: boolean; phase: 'parsed' | 'persisted' }> {
  if (!/^\d{8}$/.test(date)) throw new Error(`KSEI date must be YYYYMMDD, got "${date}"`)

  const cacheKey = `ksei:parsed:${date}`
  let rows: KseiRow[] | null = null
  let cached = false

  // Try KV cache first (fast path).
  if (kv) {
    const hit = await kv.get(cacheKey, 'json')
    if (hit && Array.isArray(hit)) {
      rows = hit as KseiRow[]
      cached = true
    }
  }

  // Phase 1 — parse + cache only. Skip if cache hit AND not explicitly asked
  // to re-parse (parseOnly forces refresh too).
  if (!rows) {
    rows = await fetchAndParse(client, date)
    if (kv && rows.length > 0) {
      try {
        await kv.put(cacheKey, JSON.stringify(rows), { expirationTtl: KV_TTL_SECONDS })
      } catch (err) {
        console.warn(`[ksei] KV cache write failed: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // If parseOnly, return without writing to D1.
  if (options.parseOnly) {
    return { count: 0, total: rows.length, cached, phase: 'parsed' }
  }

  // Phase 2 — persist chunk to D1.
  const offset = options.offset ?? 0
  const limit = options.limit ?? rows.length
  const slice = rows.slice(offset, offset + limit)
  if (slice.length === 0) return { count: 0, total: rows.length, cached, phase: 'persisted' }
  const db = getDb(d1)
  const count = await batchUpsert(db, slice, (row) =>
    db
      .insert(schemas.kseiOwnership)
      .values(row)
      .onConflictDoUpdate({ target: schemas.kseiOwnership.id, set: row })
  )
  return { count, total: rows.length, cached, phase: 'persisted' }
}
