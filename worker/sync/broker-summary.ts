import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface BrokerSummaryRaw {
  IDBrokerSummary: number
  Date: string
  IDFirm: string
  FirmName?: string
  Value: number
  Volume: number
  Frequency: number
}

export async function syncBrokerSummary(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/TradingSummary/GetBrokerSummary?length=9999&start=0&date=${date}`
  const raw = await fetchIdxJson<{ data: BrokerSummaryRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const rows = raw.data
    .filter((item) => typeof item.IDBrokerSummary === 'number' && item.IDFirm && item.Date)
    .map((item) => ({
      id: item.IDBrokerSummary,
      date: new Date(item.Date).getTime(),
      brokerCode: item.IDFirm,
      brokerName: item.FirmName ?? null,
      totalValue: item.Value,
      volume: item.Volume,
      frequency: item.Frequency
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.brokerSummary).values(row).onConflictDoUpdate({
      target: schemas.brokerSummary.id,
      set: row
    })
  )
  return { count }
}
