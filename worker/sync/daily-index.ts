// Daily index time-series per index — flattened from {Name, months: [{date, close: {value}}]}
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface IndexPoint { date: string; close?: { value: number } }
interface IndexEntry { Name: string; months?: IndexPoint[] }
interface DailyIndexResponse { data?: IndexEntry[] }

export async function syncDailyIndex(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = btoa(JSON.stringify({ year, month, quarter: 0, type: 'monthly' }))
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=LINK_DAILY_IDX_INDICES&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<DailyIndexResponse>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows: { id: string; name: string; close: number; date: number; period: number }[] = []
  for (const entry of raw.data) {
    if (!Array.isArray(entry.months)) continue
    for (const point of entry.months) {
      if (!point?.date) continue
      const date = new Date(point.date).getTime()
      rows.push({
        id: `${entry.Name}-${date}`,
        name: entry.Name,
        close: point.close?.value ?? 0,
        date,
        period
      })
    }
  }
  if (!rows.length) return { count: 0 }

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.dailyIndex).values(row).onConflictDoUpdate({
      target: schemas.dailyIndex.id,
      set: { close: row.close, period: row.period }
    })
  )
  return { count }
}
