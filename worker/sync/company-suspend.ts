import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface SuspendRaw {
  Kode: string
  Judul?: string
  Date: string
  Info_Type?: string
  Data_Download?: string
}

interface SuspendResponse {
  Results?: SuspendRaw[]
}

export async function syncCompanySuspend(
  d1: D1Database,
  client: IdxClient
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/Home/GetSuspendData?resultCount=9999`
  const raw = await fetchIdxJson<SuspendResponse>(client, url)
  if (!raw?.Results?.length) return { count: 0 }

  const db = getDb(d1)
  const rows = raw.Results
    .filter((item) => item.Kode && item.Date)
    .map((item) => ({
      id: `${item.Kode}-${new Date(item.Date).getTime()}`,
      code: item.Kode,
      title: item.Judul ?? null,
      date: new Date(item.Date).getTime(),
      type: item.Info_Type ?? null,
      downloadUrl: item.Data_Download ?? null
    }))

  const count = await batchUpsert(rows, (row) =>
    db
      .insert(schemas.companySuspend)
      .values(row)
      .onConflictDoUpdate({
        target: schemas.companySuspend.id,
        set: {
          code: row.code,
          title: row.title,
          date: row.date,
          type: row.type,
          downloadUrl: row.downloadUrl
        }
      })
  )
  return { count }
}
