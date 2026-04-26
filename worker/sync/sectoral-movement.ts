// Sectoral movement — multi-series time-series per sector.
// Response: { series: [{ seriesName, seriesData: [{ x: date, y: change }] }] }
// We flatten into rows: id = "{sector}-{date}" so onConflict works.
import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson, periodMillis } from './_helpers.ts'

interface SectorPoint { x: string; y: number }
interface SectorSeries { seriesName: string; seriesData: SectorPoint[] }
interface SectoralResponse { series?: SectorSeries[] }

export async function syncSectoralMovement(
  d1: D1Database,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  const queryB64 = btoa(JSON.stringify({ year, month, quarter: 0, type: 'monthly' }))
  const url = `${IDX_BASE}/primary/DigitalStatistic/GetApiData?urlName=LINK_DPS_JCI_SECTORAL_MOVEMENT&query=${queryB64}&isPrint=False&cumulative=false`
  const raw = await fetchIdxJson<SectoralResponse>(client, url)
  if (!raw?.series?.length) return { count: 0 }

  const period = periodMillis(year, month)
  const rows: { id: string; name: string; date: number; change: number; period: number }[] = []
  for (const series of raw.series) {
    if (!Array.isArray(series.seriesData)) continue
    for (const point of series.seriesData) {
      if (!point?.x) continue
      const date = new Date(point.x).getTime()
      rows.push({
        id: `${series.seriesName}-${date}`,
        name: series.seriesName,
        date,
        change: point.y ?? 0,
        period
      })
    }
  }
  if (!rows.length) return { count: 0 }

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.sectoralMovement).values(row).onConflictDoUpdate({
      target: schemas.sectoralMovement.id,
      set: { name: row.name, date: row.date, change: row.change, period: row.period }
    })
  )
  return { count }
}
