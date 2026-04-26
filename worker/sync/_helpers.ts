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
import type { IdxClient } from '../lib/client.ts'

export const IDX_BASE = 'https://www.idx.co.id'

const CHUNK_SIZE = 500

/**
 * Build base64-encoded JSON query for the LINK_* endpoints that use it.
 * Matches upstream pattern `btoa(JSON.stringify({ periodYear, periodMonth }))`.
 */
export function buildBase64PeriodQuery(year: number, month: number): string {
  return btoa(JSON.stringify({ periodYear: year, periodMonth: month }))
}

/**
 * Run upserts in chunks to stay within D1 sub-request limits and not block
 * the event loop. Returns total written count.
 */
export async function batchUpsert<T>(
  rows: T[],
  upsertOne: (row: T) => Promise<unknown>
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const slice = rows.slice(i, i + CHUNK_SIZE)
    await Promise.all(slice.map(upsertOne))
  }
  return rows.length
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
