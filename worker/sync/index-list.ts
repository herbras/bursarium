// Reference port of one sync job — `syncIndexList` from the Deno version.
// Demonstrates the pattern that the other ~37 syncs will follow:
//   1. Receive (db, client) from queue consumer
//   2. Fetch IDX endpoint via IdxClient
//   3. Map raw response to schema-typed values
//   4. Upsert via db.insert(...).onConflictDoUpdate(...)
//
// Note: the original `syncIndexList` also recursed into `syncIndexChart` for
// each index, sleeping 500ms between calls. On Workers we MUST NOT do that —
// the queue consumer is per-job. Instead, after this sync writes the list,
// it enqueues a `indexChart` job per code (left as TODO).

import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'

interface IndexRaw {
  IndexCode: string
  Closing?: string
  Change?: string
  Percent?: string
  Current?: string
}

export async function syncIndexList(d1: D1Database, client: IdxClient): Promise<{ count: number }> {
  const raw = await client.fetchJson<unknown>(
    'https://www.idx.co.id/primary/home/GetIndexList'
  )
  if (!Array.isArray(raw)) {
    return { count: 0 }
  }

  const rows = (raw as IndexRaw[]).map((item) => ({
    code: item.IndexCode,
    close: item.Closing ?? null,
    change: item.Change ?? null,
    percent: item.Percent ?? null,
    current: item.Current ?? null
  }))

  const db = getDb(d1)
  // D1 supports batched statements. For ~30 indices this is fine in one round.
  await Promise.all(
    rows.map((row) =>
      db
        .insert(schemas.indexList)
        .values(row)
        .onConflictDoUpdate({
          target: schemas.indexList.code,
          set: {
            close: row.close,
            change: row.change,
            percent: row.percent,
            current: row.current
          }
        })
    )
  )

  return { count: rows.length }
}
