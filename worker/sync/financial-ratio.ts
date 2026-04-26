// Financial ratios per ticker per fsDate (financial statement date).
// Single page (no pagination on this endpoint).
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert } from './_helpers.ts'
import { fetchSinglePagePeriod } from './_paginated.ts'

interface RatioRaw {
  code: string
  stockName?: string
  sector?: string
  subSector?: string
  industry?: string
  subIndustry?: string
  fsDate: string
  assets?: number
  liabilities?: number
  equity?: number
  sales?: number
  ebt?: number
  profitPeriod?: number
  eps?: number
  bookValue?: number
  per?: number
  priceBV?: number
  deRatio?: number
  roa?: number
  roe?: number
  npm?: number
}

export async function syncFinancialRatio(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchSinglePagePeriod<RatioRaw>(client, 'LINK_FINANCIAL_DATA_RATIO', year, month)
  if (!items.length) return { count: 0 }

  const rows = items
    .filter((item) => item.code && item.fsDate)
    .map((item) => {
      const period = new Date(item.fsDate).getTime()
      return {
        id: `${item.code}-${period}`,
        code: item.code,
        name: item.stockName ?? null,
        sector: item.sector ?? null,
        subSector: item.subSector ?? null,
        industry: item.industry ?? null,
        subIndustry: item.subIndustry ?? null,
        period,
        assets: item.assets ?? null,
        liabilities: item.liabilities ?? null,
        equity: item.equity ?? null,
        sales: item.sales ?? null,
        ebt: item.ebt ?? null,
        profit: item.profitPeriod ?? null,
        eps: item.eps ?? null,
        bookValue: item.bookValue ?? null,
        per: item.per ?? null,
        pbv: item.priceBV ?? null,
        der: item.deRatio ?? null,
        roa: item.roa ?? null,
        roe: item.roe ?? null,
        npm: item.npm ?? null
      }
    })

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.financialRatio).values(row).onConflictDoUpdate({
      target: schemas.financialRatio.id,
      set: row
    })
  )
  return { count }
}
