// Bulk sync of all listed companies (~950 rows).
// SKIPS the per-company `getCompanyProfilesDetail` recursion that upstream
// does — that's 950 individual fetches with 500ms delay = 8 minutes,
// which doesn't fit Workers CPU budget. Per-detail population is a
// separate queue-fan-out sync (TODO).
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface ProfileRaw {
  KodeEmiten: string
  NamaEmiten: string
  TanggalPencatatan: string
}

interface ProfileResponse {
  data: ProfileRaw[]
}

export async function syncCompanyProfile(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/ListedCompany/GetCompanyProfiles?start=0&length=9999`
  const raw = await fetchIdxJson<ProfileResponse>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.data
    .filter((item) => item.KodeEmiten && item.NamaEmiten)
    .map((item) => ({
      code: item.KodeEmiten,
      name: item.NamaEmiten,
      listingDate: item.TanggalPencatatan ? new Date(item.TanggalPencatatan) : null
    }))

  const count = await batchUpsert(db, rows, (row) =>
    db
      .insert(schemas.companyProfile)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.companyProfile.code,
        set: { name: row.name, listingDate: row.listingDate }
      })
  )
  return { count }
}
