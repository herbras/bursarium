import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface DelistingRaw {
  code: string
  issuerName?: string
  ListedShares: number
  MCap: number
  RegPrice: number
  LastDate: string
  ListingDate?: string
  DeListingDate: string
}

export async function syncCompanyDelisting(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<DelistingRaw>(client, 'LINK_DELISTING', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.issuerName && item.DeListingDate)
    .map((item) => ({
      id: `${item.code}-${new Date(item.DeListingDate).getTime()}`,
      code: item.code,
      name: item.issuerName as string,
      listedShares: item.ListedShares,
      marketCap: item.MCap,
      regularPrice: item.RegPrice,
      lastDate: new Date(item.LastDate).getTime(),
      listingDate: item.ListingDate ? new Date(item.ListingDate).getTime() : null,
      delistingDate: new Date(item.DeListingDate).getTime(),
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.companyDelisting).values(row).onConflictDoUpdate({
      target: schemas.companyDelisting.id,
      set: row
    })
  )
  return { count }
}
