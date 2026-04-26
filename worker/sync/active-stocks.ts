// Three "most active" syncs share the same response shape — bundled.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchSinglePagePeriod } from './_paginated.ts'

interface ActiveRaw {
  code: string
  name?: string
  volume?: number
  value?: number
  frequency?: number
  volumePercent?: number
  valuePercent?: number
  freqPercent?: number
  tradingDays?: number
}

async function syncActive(
  d1: D1Database,
  client: IdxClient,
  table: typeof schemas.activeFrequency | typeof schemas.activeValue | typeof schemas.activeVolume,
  linkName: string,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchSinglePagePeriod<ActiveRaw>(client, linkName, year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code)
    .map((item) => ({
      id: `${item.code}-${period}`,
      code: item.code,
      name: item.name ?? null,
      volume: item.volume ?? null,
      value: item.value ?? null,
      frequency: item.frequency ?? null,
      volumePercent: item.volumePercent ?? null,
      valuePercent: item.valuePercent ?? null,
      frequencyPercent: item.freqPercent ?? null,
      tradingDays: item.tradingDays ?? null,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row })
  )
  return { count }
}

export const syncActiveFrequency = (d1: D1Database, c: IdxClient, y: number, m: number) =>
  syncActive(d1, c, schemas.activeFrequency, 'LINK_MOST_ACTIVE_STOCK_FREQ', y, m)

export const syncActiveValue = (d1: D1Database, c: IdxClient, y: number, m: number) =>
  syncActive(d1, c, schemas.activeValue, 'LINK_MOST_ACTIVE_STOCK_VALUE', y, m)

export const syncActiveVolume = (d1: D1Database, c: IdxClient, y: number, m: number) =>
  syncActive(d1, c, schemas.activeVolume, 'LINK_MOST_ACTIVE_STOCK_VOLUME', y, m)
