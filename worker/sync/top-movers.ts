// Top gainer + top loser — period-based (year, month) via base64-encoded query.
// Bundled because they share the same fetcher shape (LINK_TOP_GAINER vs LINK_TOP_LOSER).
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface TopMoverRaw {
  Code: string
  StockName?: string
  prevValue?: number
  prevValueCA?: number
  closeValue?: number
  dilution?: number
  changePrice?: number
  changePercentage?: number
}

interface TopMoverResponse {
  data: TopMoverRaw[]
}

// Build base64 query — note: upstream uses `year`/`month` as STRINGS plus
// `quarter: 0, type: "monthly"`. Match that exactly.
function buildTopMoverQuery(year: number, month: number): string {
  return btoa(JSON.stringify({
    year: year.toString(),
    month: month.toString(),
    quarter: 0,
    type: 'monthly'
  }))
}

async function syncTopMover(
  d1: D1Database,
  client: IdxClient,
  table: typeof schemas.topGainer | typeof schemas.topLoser,
  linkName: 'LINK_TOP_GAINER' | 'LINK_TOP_LOSER',
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = buildTopMoverQuery(year, month)
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=${linkName}&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<TopMoverResponse>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = raw.data
    .filter((item) => item.Code)
    .map((item) => ({
      id: `${item.Code}-${period}`,
      code: item.Code,
      name: item.StockName ?? null,
      previous: item.prevValue ?? null,
      previousCa: item.prevValueCA ?? null,
      close: item.closeValue ?? null,
      dilution: item.dilution ?? null,
      change: item.changePrice ?? null,
      percentage: item.changePercentage ?? null,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db
      .insert(table)
      .values(row)
      .onConflictDoUpdate({ target: table.id, set: row })
  )
  return { count }
}

export async function syncTopGainer(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  return syncTopMover(d1, client, schemas.topGainer, 'LINK_TOP_GAINER', year, month)
}

export async function syncTopLoser(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  return syncTopMover(d1, client, schemas.topLoser, 'LINK_TOP_LOSER', year, month)
}
