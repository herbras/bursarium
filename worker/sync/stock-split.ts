import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface StockSplitRaw {
  code: string
  stockname?: string
  ssrs?: string
  Ratio?: string
  NominalValue?: number
  NominalValueNew?: number
  AdditionalListedShares?: number
  ListedShares?: number
  ListingDate: string
}

export async function syncStockSplit(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<StockSplitRaw>(client, 'LINK_STOCK_SPLIT', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.ListingDate)
    .map((item) => ({
      id: `${item.code}-${new Date(item.ListingDate).getTime()}`,
      code: item.code,
      name: item.stockname ?? null,
      type: item.ssrs ?? null,
      ratio: item.Ratio ?? null,
      oldNominal: item.NominalValue ?? null,
      newNominal: item.NominalValueNew ?? null,
      additionalShares: item.AdditionalListedShares ?? null,
      listedShares: item.ListedShares ?? null,
      listingDate: new Date(item.ListingDate).getTime(),
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.stockSplit).values(row).onConflictDoUpdate({
      target: schemas.stockSplit.id,
      set: row
    })
  )
  return { count }
}
