// Shared helpers for sync jobs.
//
// Most syncs follow one of these shapes:
//   1. Simple bulk fetch -> map -> upsert
//   2. Period-based (year+month) fetch via LINK_* paginated API
//   3. Period-based fetch via base64-encoded query (LINK_* GetApiData)
//   4. Date-based daily snapshot
//
// We keep upsert via Promise.all of individual db.insert(...).onConflictDoUpdate
// statements for compatibility with the upstream pattern. D1 serializes them
// internally; for >1000 rows we chunk to avoid sub-request limits.

import type { D1Database } from '@cloudflare/workers-types'
import type { BatchItem } from 'drizzle-orm/batch'
import type { IdxClient } from '../lib/client.ts'
import type { Database } from '../lib/db.ts'

export const IDX_BASE = 'https://www.idx.co.id'

// D1 batch limit is 100 statements per call. We stay below that.
const BATCH_CHUNK = 50

/**
 * Build base64-encoded JSON query for the LINK_* endpoints that use it.
 * Matches upstream pattern `btoa(JSON.stringify({ periodYear, periodMonth }))`.
 */
export function buildBase64PeriodQuery(year: number, month: number): string {
  return btoa(JSON.stringify({ periodYear: year, periodMonth: month }))
}

/**
 * Bulk upsert via D1 batch API.
 *
 * D1 batch API runs N statements in a single HTTP roundtrip atomically —
 * orders of magnitude faster than `Promise.all` of individual inserts,
 * which D1 serializes internally and can blow the 30s CPU budget at
 * 1000-row scale.
 *
 * Atomicity per chunk: one bad row in a chunk fails the whole chunk.
 * To salvage other chunks we catch + log the error per chunk and move on,
 * but rows in the failed chunk are not retried individually here. For
 * surgical debugging, look at the logged first-row payload + error cause.
 *
 * @returns count of rows successfully written.
 */
// biome-ignore lint/suspicious/noExplicitAny: BatchItem internals are very generic
type DrizzleStmt = BatchItem<any>

export async function batchUpsert<T>(
  db: Database,
  rows: T[],
  prepare: (row: T) => DrizzleStmt,
  options: { chunkSize?: number } = {}
): Promise<number> {
  if (rows.length === 0) return 0
  let ok = 0
  let chunksFailed = 0
  const chunk = options.chunkSize ?? BATCH_CHUNK

  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    // biome-ignore lint/suspicious/noExplicitAny: BatchItem array typing is delicate
    const stmts = slice.map(prepare) as any
    try {
      await db.batch(stmts)
      ok += slice.length
    } catch (err) {
      chunksFailed++
      const message = err instanceof Error ? err.message : String(err)
      // biome-ignore lint/suspicious/noExplicitAny: D1 errors expose cause
      const cause = (err as any)?.cause
      console.error(
        `[batchUpsert] chunk ${i / chunk + 1} of ${Math.ceil(rows.length / chunk)} ` +
          `(rows ${i}-${i + slice.length - 1}) failed: ${message}\n` +
          `cause: ${JSON.stringify(cause, null, 2)}\n` +
          `first row in chunk: ${JSON.stringify(slice[0]).slice(0, 500)}`
      )
    }
  }

  if (chunksFailed > 0) {
    console.warn(`[batchUpsert] ${chunksFailed} chunks failed; ${ok}/${rows.length} rows persisted`)
  }
  return ok
}

/**
 * Compute the WIB-aware milliseconds for the first day of (year, month).
 * Used by syncs that store `period` as a timestamp.
 */
export function periodMillis(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getTime()
}

/**
 * Try a fetch+JSON via IdxClient with sensible logging. Returns null if the
 * response is not a usable shape.
 */
export async function fetchIdxJson<T>(
  client: IdxClient,
  url: string
): Promise<T | null> {
  try {
    return await client.fetchJson<T>(url)
  } catch (err) {
    console.warn(
      `[sync] fetchIdxJson failed: ${url} — ${err instanceof Error ? err.message : String(err)}`
    )
    return null
  }
}

/**
 * Common run wrapper: returns result + duration, captures errors.
 */
export async function runSync<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; result: T; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const start = Date.now()
  try {
    const result = await fn()
    return { ok: true, result, durationMs: Date.now() - start }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start
    }
  }
}

// Re-export commonly used types so per-sync files don't need to import D1Database.
export type { D1Database }
