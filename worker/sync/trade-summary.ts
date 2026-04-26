// Aggregate market segment trade data (composite PK on id+date).
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface TradeSummaryRaw {
  DESCRIPTION: string
  Volume: number
  Value: number
  Frequency: number
  Dates: string
}

export async function syncTradeSummary(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/Home/GetTradeSummary?lang=id`
  const raw = await fetchIdxJson<TradeSummaryRaw[]>(client, url)
  if (!Array.isArray(raw) || raw.length === 0) return { count: 0 }

  const db = getDb(d1)
  const rows = raw
    .filter((item) => item.DESCRIPTION && item.Dates)
    .map((item) => ({
      id: item.DESCRIPTION,
      volume: item.Volume,
      value: item.Value,
      frequency: item.Frequency,
      date: new Date(item.Dates).getTime()
    }))

  // tradeSummary uses composite primary key (id, date); on-conflict
  // refers to *that* PK, not a single column.
  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.tradeSummary)
      .values(row)
      .onConflictDoUpdate({
        target: [schemas.tradeSummary.id, schemas.tradeSummary.date],
        set: {
          volume: row.volume,
          value: row.value,
          frequency: row.frequency
        }
      })
  )
  return { count }
}
