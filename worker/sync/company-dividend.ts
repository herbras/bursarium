import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface DividendRaw {
  code: string
  name?: string
  cashDividend: number
  cumDividend?: string
  exDividend?: string
  recordDate: string
  paymentDate?: string
}

export async function syncCompanyDividend(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<DividendRaw>(client, 'LINK_DIVIDEND', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.recordDate)
    .map((item) => ({
      id: `${item.code}-${new Date(item.recordDate).getTime()}`,
      code: item.code,
      name: item.name ?? null,
      cashDividend: item.cashDividend,
      cumDividend: item.cumDividend ? new Date(item.cumDividend).getTime() : null,
      exDividend: item.exDividend ? new Date(item.exDividend).getTime() : null,
      recordDate: new Date(item.recordDate).getTime(),
      paymentDate: item.paymentDate ? new Date(item.paymentDate).getTime() : null,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.companyDividend).values(row).onConflictDoUpdate({
      target: schemas.companyDividend.id,
      set: row
    })
  )
  return { count }
}
