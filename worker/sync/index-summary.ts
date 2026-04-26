import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface IndexSummaryRaw {
  IndexSummaryID: number
  IndexCode: string
  Date: string
  Previous?: number
  Close?: number
  Highest?: number
  Lowest?: number
  Change?: number
  Volume?: number
  Value?: number
  Frequency?: number
  MarketCapital?: number
}

export async function syncIndexSummary(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/TradingSummary/GetIndexSummary?lang=id&date=${date}&start=0&length=9999`
  const raw = await fetchIdxJson<{ data: IndexSummaryRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const rows = raw.data
    .filter((item) => typeof item.IndexSummaryID === 'number' && item.IndexCode && item.Date)
    .map((item) => {
      const previous = item.Previous ?? 0
      const change = item.Change ?? 0
      const percent = previous !== 0 ? Number(((change / previous) * 100).toFixed(2)) : 0
      return {
        id: item.IndexSummaryID,
        code: item.IndexCode,
        name: item.IndexCode,
        date: new Date(item.Date).getTime(),
        previous: item.Previous ?? null,
        high: item.Highest ?? null,
        low: item.Lowest ?? null,
        close: item.Close ?? null,
        change: item.Change ?? null,
        percent,
        volume: item.Volume ?? null,
        value: item.Value ?? null,
        frequency: item.Frequency ?? null,
        marketCap: item.MarketCapital ?? null
      }
    })

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.indexSummary).values(row).onConflictDoUpdate({
      target: schemas.indexSummary.id,
      set: row
    })
  )
  return { count }
}
