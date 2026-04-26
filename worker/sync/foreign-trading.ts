import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface ForeignRaw {
  date: string
  foreignForeignVolume: number
  foreignForeignValue: number
  foreignForeignFreq: number
  foreignDomesticVolume: number
  foreignDomesticValue: number
  foreignDomesticFreq: number
}

export async function syncForeignTrading(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = btoa(JSON.stringify({ year: year.toString(), month: month.toString(), quarter: 0, type: 'monthly' }))
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=LINK_TABLE_DAILY_TRADING_INVESTOR_FOREIGN&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<{ data: ForeignRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = raw.data
    .filter((item) => item.date)
    .map((item) => ({
      date: new Date(item.date).getTime(),
      buyVolume: item.foreignForeignVolume + item.foreignDomesticVolume,
      buyValue: item.foreignForeignValue + item.foreignDomesticValue,
      buyFrequency: item.foreignForeignFreq + item.foreignDomesticFreq,
      sellVolume: item.foreignForeignVolume,
      sellValue: item.foreignForeignValue,
      sellFrequency: item.foreignForeignFreq,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.foreignTrading).values(row).onConflictDoUpdate({
      target: schemas.foreignTrading.date,
      set: row
    })
  )
  return { count }
}
