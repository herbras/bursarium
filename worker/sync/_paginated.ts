// Helpers for LINK_* paginated period endpoints.
//
// Pagination shape:
//   GetApiDataPaginated?urlName=LINK_X&periodYear=Y&periodMonth=M&periodType=monthly
//                      &isPrint=False&cumulative=false&pageSize=N&pageNumber=K
//
// Response: { data: T[], recordsTotal: number }
//
// Some endpoints have no pagination (active-* and industry/financial-ratio
// return all rows in single page). For those we just hit pageSize=9999.

import type { IdxClient } from '../lib/client.ts'
import { IDX_BASE, fetchIdxJson } from './_helpers.ts'

interface Paginated<T> {
  data?: T[]
  recordsTotal?: number
}

export async function fetchPaginatedAll<T>(
  client: IdxClient,
  linkName: string,
  year: number,
  month: number,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = []
  let pageNumber = 1
  // Bound by recordsTotal — fetch first page, then walk the rest.
  // Avoid infinite loops: cap at 50 pages (50 * 1000 = 50K rows, plenty).
  const maxPages = 50

  while (pageNumber <= maxPages) {
    const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiDataPaginated?urlName=${linkName}&periodYear=${year}&periodMonth=${month}&periodType=monthly&isPrint=False&cumulative=false&pageSize=${pageSize}&pageNumber=${pageNumber}`
    const raw = await fetchIdxJson<Paginated<T>>(client, url)
    if (!raw?.data?.length) break
    out.push(...raw.data)
    if (raw.data.length < pageSize) break // last page
    if (raw.recordsTotal !== undefined && out.length >= raw.recordsTotal) break
    pageNumber++
  }
  return out
}

export async function fetchSinglePagePeriod<T>(
  client: IdxClient,
  linkName: string,
  year: number,
  month: number
): Promise<T[]> {
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiDataPaginated?urlName=${linkName}&periodYear=${year}&periodMonth=${month}&periodType=monthly&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<Paginated<T>>(client, url)
  return raw?.data ?? []
}
