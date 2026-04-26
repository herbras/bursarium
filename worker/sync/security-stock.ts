import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface SecurityRaw {
  Code: string
  Name: string
  Shares?: number
  ListingDate?: string
  ListingBoard?: string
}

interface SecurityResponse {
  data: SecurityRaw[]
}

export async function syncSecurityStock(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/StockData/GetSecuritiesStock?start=0&length=9999&code=&sector=&board=`
  const raw = await fetchIdxJson<SecurityResponse>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.data
    .filter((item) => item.Code && item.Name)
    .map((item) => ({
      code: item.Code,
      name: item.Name,
      shares: item.Shares ?? null,
      listingBoard: item.ListingBoard ?? null,
      listingDate: item.ListingDate ? new Date(item.ListingDate) : null
    }))

  const count = await batchUpsert(db, rows, (row) =>
    db
      .insert(schemas.securityStock)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.securityStock.code,
        set: {
          name: row.name,
          shares: row.shares,
          listingBoard: row.listingBoard,
          listingDate: row.listingDate
        }
      })
  )
  return { count }
}
