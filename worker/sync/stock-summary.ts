import type { D1Database } from '@cloudflare/workers-types'
import type { IdxClient } from '../lib/client.ts'
import { getDb, schemas } from '../lib/db.ts'
import { IDX_BASE, batchUpsert, fetchIdxJson } from './_helpers.ts'

interface StockSummaryRaw {
  IDStockSummary: number
  StockCode: string
  StockName?: string
  Date: string
  Remarks?: string
  OpenPrice?: number
  High?: number
  Low?: number
  Close?: number
  Previous?: number
  Change?: number
  Volume?: number
  Value?: number
  Frequency?: number
  FirstTrade?: number
  Bid?: number
  BidVolume?: number
  Offer?: number
  OfferVolume?: number
  ForeignBuy?: number
  ForeignSell?: number
  ListedShares?: number
  TradebleShares?: number
  WeightForIndex?: number
  IndexIndividual?: number
  NonRegularVolume?: number
  NonRegularValue?: number
  NonRegularFrequency?: number
}

export async function syncStockSummary(
  d1: D1Database,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  const url = `${IDX_BASE}/primary/TradingSummary/GetStockSummary?date=${date}`
  const raw = await fetchIdxJson<{ data: StockSummaryRaw[] }>(client, url)
  if (!raw?.data?.length) return { count: 0 }

  const rows = raw.data
    .filter((item) => typeof item.IDStockSummary === 'number' && item.StockCode && item.Date)
    .map((item) => ({
      id: item.IDStockSummary,
      code: item.StockCode,
      name: item.StockName ?? null,
      date: new Date(item.Date).getTime(),
      remarks: item.Remarks ?? null,
      open: item.OpenPrice ?? null,
      high: item.High ?? null,
      low: item.Low ?? null,
      close: item.Close ?? null,
      previous: item.Previous ?? null,
      change: item.Change ?? null,
      volume: item.Volume ?? null,
      value: item.Value ?? null,
      frequency: item.Frequency ?? null,
      firstTrade: item.FirstTrade ?? null,
      bid: item.Bid ?? null,
      bidVolume: item.BidVolume ?? null,
      offer: item.Offer ?? null,
      offerVolume: item.OfferVolume ?? null,
      foreignBuy: item.ForeignBuy ?? null,
      foreignSell: item.ForeignSell ?? null,
      foreignNet:
        typeof item.ForeignBuy === 'number' && typeof item.ForeignSell === 'number'
          ? item.ForeignBuy - item.ForeignSell
          : null,
      listedShares: item.ListedShares ?? null,
      tradableShares: item.TradebleShares ?? null,
      weightForIndex: item.WeightForIndex ?? null,
      individualIndex: item.IndexIndividual ?? null,
      nonRegularVolume: item.NonRegularVolume ?? null,
      nonRegularValue: item.NonRegularValue ?? null,
      nonRegularFrequency: item.NonRegularFrequency ?? null
    }))

  const db = getDb(d1)
  const count = await batchUpsert(db, rows, (row) =>
    db.insert(schemas.stockSummary).values(row).onConflictDoUpdate({
      target: schemas.stockSummary.id,
      set: row
    })
  )
  return { count }
}
