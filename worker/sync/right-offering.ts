import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { batchUpsert, periodMillis } from './_helpers.ts'
import { fetchPaginatedAll } from './_paginated.ts'

interface RightOfferingRaw {
  code: string
  issuerName?: string
  ratio?: string
  exPrice?: number
  fundRaised?: number
  exDate?: string
  recDate?: string
  rightCert?: string
}

export async function syncRightOffering(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const items = await fetchPaginatedAll<RightOfferingRaw>(client, 'LINK_RIGHT_OFFERING', year, month)
  if (!items.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows = items
    .filter((item) => item.code && item.recDate)
    .map((item) => ({
      id: `${item.code}-${new Date(item.recDate as string).getTime()}`,
      code: item.code,
      name: item.issuerName ?? null,
      ratio: item.ratio ?? null,
      exercisePrice: item.exPrice ?? null,
      fundRaised: item.fundRaised ?? null,
      exerciseDate: item.exDate ? new Date(item.exDate).getTime() : null,
      recordingDate: item.recDate ? new Date(item.recDate).getTime() : null,
      tradingPeriod: item.rightCert ?? null,
      period
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.rightOffering).values(row).onConflictDoUpdate({
      target: schemas.rightOffering.id,
      set: row
    })
  )
  return { count }
}
