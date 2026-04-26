import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface NewListingRaw {
  code: string
  issuerName?: string
  ListedShares?: number
  NumOfShares: number
  Offering: number
  FundRaised?: number
  ListingDate: string
}

export async function syncNewListing(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<NewListingRaw>(client, 'LINK_STOCK_NEW_LISTING', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.issuerName && item.ListingDate)
    .map((item) => ({
      code: item.code,
      name: item.issuerName as string,
      listedShares: item.ListedShares ?? null,
      offeringShares: item.NumOfShares,
      offeringPrice: item.Offering,
      fundRaised: item.FundRaised ?? null,
      listingDate: new Date(item.ListingDate).getTime(),
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.newListing).values(row).onConflictDoUpdate({
      target: schemas.newListing.code,
      set: row
    })
  )
  return { count }
}
