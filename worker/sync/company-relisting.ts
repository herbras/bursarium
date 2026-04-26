import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface RelistingRaw {
  KodeEmiten: string
  NamaEmiten: string
  TanggalPencatatan: string
}

interface RelistingResponse {
  Activities?: RelistingRaw[]
}

export async function syncCompanyRelisting(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/Home/GetRelistingData?pageSize=9999&indexFrom=0`
  const raw = await fetchIdxJson<RelistingResponse>(client, url)
  if (!raw?.Activities?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.Activities
    .filter((item) => item.KodeEmiten && item.NamaEmiten && item.TanggalPencatatan)
    .map((item) => ({
      code: item.KodeEmiten,
      name: item.NamaEmiten,
      listingDate: new Date(item.TanggalPencatatan).getTime()
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.companyRelisting)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.companyRelisting.code,
        set: { name: row.name, listingDate: row.listingDate }
      })
  )
  return { count }
}
