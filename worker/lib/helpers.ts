import { count, type SQL } from 'drizzle-orm'
import type { Database } from './db.ts'
import type { PaginatedEnvelope, PaginatedMeta, PaginationParams } from './types.ts'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500
const MAX_OFFSET = 100_000

export function getPagination(query: Record<string, string | undefined>): PaginationParams {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  )
  const rawOffset = Math.max(0, Number.parseInt(query.offset ?? '0', 10) || 0)
  const offset = Math.min(rawOffset, MAX_OFFSET)
  const totalParam = query.total?.toLowerCase()
  const includeTotal = totalParam === '1' || totalParam === 'true'
  return { limit, offset, includeTotal }
}

export function paginatedEnvelope<T>(
  data: T[],
  meta: { limit: number; offset: number; total?: number }
): PaginatedEnvelope<T> {
  const m: PaginatedMeta = { limit: meta.limit, offset: meta.offset }
  if (meta.total !== undefined) {
    m.total = meta.total
  }
  return { data, meta: m }
}

// biome-ignore lint/suspicious/noExplicitAny: drizzle table types are complex
export async function getTotalCount(
  db: Database,
  table: any,
  whereClause?: SQL | undefined
): Promise<number> {
  const builder = db.select({ count: count() }).from(table)
  const rows = whereClause !== undefined ? await builder.where(whereClause) : await builder
  const first = rows[0]
  return typeof first?.count === 'number' ? first.count : 0
}

export function parseDate(dateStr: string): number | null {
  if (!dateStr || !/^\d{8}$/.test(dateStr)) {
    return null
  }
  const y = Number.parseInt(dateStr.slice(0, 4), 10)
  const m = Number.parseInt(dateStr.slice(4, 6), 10) - 1
  const d = Number.parseInt(dateStr.slice(6, 8), 10)
  const t = new Date(Date.UTC(y, m, d)).getTime()
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

// Period stored in DB by syncs is `new Date(Date.UTC(year, month-1, 1)).getTime()`
// (epoch milliseconds for first day of the month). Routes that filter by
// period must use the same encoding to match.
export function monthToPeriod(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getTime()
}

export function getYearMonth(query: Record<string, string | undefined>): {
  year: number
  month: number
} | null {
  const year = Number.parseInt(query.year ?? '', 10)
  const month = Number.parseInt(query.month ?? '', 10)
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month }
}
