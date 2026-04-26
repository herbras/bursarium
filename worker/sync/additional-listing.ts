import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface AdditionalListingRaw {
  code: string
  issuerName?: string
  NumOfShares: number
  Type?: string
  StartDate: string
  LastDate: string
}

export async function syncAdditionalListing(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<AdditionalListingRaw>(client, 'LINK_LISTING', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.issuerName && item.StartDate && item.LastDate)
    .map((item) => ({
      id: `${item.code}-${new Date(item.StartDate).getTime()}`,
      code: item.code,
      name: item.issuerName as string,
      shares: item.NumOfShares,
      type: item.Type ?? null,
      startDate: new Date(item.StartDate).getTime(),
      lastDate: new Date(item.LastDate).getTime(),
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.additionalListing).values(row).onConflictDoUpdate({
      target: schemas.additionalListing.id,
      set: row
    })
  )
  return { count }
}
