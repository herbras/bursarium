// Stock screener — analytical metrics per ticker (PER, PBV, ROE, etc.).
// Intraday-relevant; recalculated when prices move.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface ScreenerRaw {
  stockCode: string
  companyName?: string
  industry?: string
  sector?: string
  subSector?: string
  subIndustry?: string
  subIndustryCode?: string
  marketCapital?: number
  tRevenue?: number
  npm?: number
  per?: number
  pbv?: number
  roa?: number
  roe?: number
  der?: number
  week4PC?: number
  week13PC?: number
  week26PC?: number
  week52PC?: number
  ytdpc?: number
  mtdpc?: number
  umaDate?: string | null
  notation?: string | null
  status?: string | null
  corpAction?: string | null
  corpActionDate?: string | null
}

interface ScreenerResponse {
  results: ScreenerRaw[]
}

export async function syncStockScreener(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/support/stock-screener/api/v1/stock-screener/get?Sector=&SubSector=`
  const raw = await fetchIdxJson<ScreenerResponse>(client, url)
  if (!raw?.results?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.results
    .filter((item) => item.stockCode)
    .map((item) => ({
      code: item.stockCode,
      name: item.companyName ?? null,
      industry: item.industry ?? null,
      sector: item.sector ?? null,
      subSector: item.subSector ?? null,
      subIndustry: item.subIndustry ?? null,
      subIndustryCode: item.subIndustryCode ?? null,
      marketCapital: item.marketCapital ?? null,
      totalRevenue: item.tRevenue ?? null,
      npm: item.npm ?? null,
      per: item.per ?? null,
      pbv: item.pbv ?? null,
      roa: item.roa ?? null,
      roe: item.roe ?? null,
      der: item.der ?? null,
      week4: item.week4PC ?? null,
      week13: item.week13PC ?? null,
      week26: item.week26PC ?? null,
      week52: item.week52PC ?? null,
      ytd: item.ytdpc ?? null,
      mtd: item.mtdpc ?? null,
      umaDate: item.umaDate ?? null,
      notation: item.notation ?? null,
      status: item.status ?? null,
      corpAction: item.corpAction ?? null,
      corpActionDate: item.corpActionDate ?? null
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.stockScreener)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.stockScreener.code,
        set: row
      })
  )
  return { count }
}
