import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface CalendarRaw {
  id: number
  title?: string
  Jenis?: string
  description?: string
  location?: string
  Step?: string
  start: string
  AgendaTahun?: string
}

interface CalendarResponse {
  Results?: CalendarRaw[]
}

export async function syncMarketCalendar(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/Home/GetCalendar?range=m&date=${date}`
  const raw = await fetchIdxJson<CalendarResponse>(client, url)
  if (!raw?.Results?.length) return { count: 0 }

  const rows = raw.Results
    .filter((item) => typeof item.id === 'number' && item.start && item.title)
    .map((item) => ({
      id: item.id,
      code: item.title as string,
      type: item.Jenis ?? null,
      description: item.description ?? null,
      location: item.location ?? null,
      step: item.Step ?? null,
      date: new Date(item.start).getTime(),
      year: item.AgendaTahun ?? null
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.marketCalendar).values(row).onConflictDoUpdate({
      target: schemas.marketCalendar.id,
      set: row
    })
  )
  return { count }
}
