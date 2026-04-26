// Industry trading aggregates — flattened from nested {months: [...]} response.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface IndustryRaw {
  Date: string
  Name?: string
  Shares?: number
  MCap?: number
  Volume?: number
  Value?: number
  Freq?: number
  PER?: number
  PBV?: number
  Members?: number
  months?: IndustryRaw[]
}

function flatten(items: IndustryRaw[], out: IndustryRaw[]): void {
  for (const item of items) {
    out.push(item)
    if (Array.isArray(item.months) && item.months.length > 0) flatten(item.months, out)
  }
}

export async function syncIndustryTrading(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = btoa(JSON.stringify({ year: year.toString(), month: month.toString(), quarter: 0, type: 'monthly' }))
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=LINK_LIST_TRADING_SUMMARY_INDUSTRY_CLASSIFICATION&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<{ data: IndustryRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const flat: IndustryRaw[] = []
  flatten(raw.data, flat)

  const period = periodMillis(year, month)
  const rows = flat
    .filter((item) => item.Date && item.Name)
    .map((item) => {
      const date = new Date(item.Date).getTime()
      return {
        id: `${item.Name}-${date}`,
        date,
        industry: item.Name as string,
        members: item.Members ?? null,
        shares: item.Shares ?? null,
        marketCap: item.MCap ?? null,
        volume: item.Volume ?? null,
        value: item.Value ?? null,
        frequency: item.Freq ?? null,
        per: item.PER ?? null,
        pbv: item.PBV ?? null,
        period
      }
    })

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.industryTrading).values(row).onConflictDoUpdate({
      target: schemas.industryTrading.id,
      set: row
    })
  )
  return { count }
}
