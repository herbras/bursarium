import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface DomesticRaw {
  date: string
  domesticForeignVolume: number
  domesticForeignValue: number
  domesticForeignFreq: number
  domesticDomesticVolume: number
  domesticDomesticValue: number
  domesticDomesticFreq: number
}

export async function syncDomesticTrading(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = btoa(JSON.stringify({ year: year.toString(), month: month.toString(), quarter: 0, type: 'monthly' }))
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=LINK_TABLE_DAILY_TRADING_INVESTOR_DOMESTIC&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<{ data: DomesticRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = raw.data
    .filter((item) => item.date)
    .map((item) => ({
      date: new Date(item.date).getTime(),
      buyVolume: item.domesticDomesticVolume + item.domesticForeignVolume,
      buyValue: item.domesticDomesticValue + item.domesticForeignValue,
      buyFrequency: item.domesticDomesticFreq + item.domesticForeignFreq,
      sellVolume: item.domesticDomesticVolume,
      sellValue: item.domesticDomesticValue,
      sellFrequency: item.domesticDomesticFreq,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.domesticTrading).values(row).onConflictDoUpdate({
      target: schemas.domesticTrading.date,
      set: row
    })
  )
  return { count }
}
