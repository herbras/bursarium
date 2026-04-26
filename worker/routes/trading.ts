// /trading/* — daily snapshots + monthly aggregates + per-company.
import { Hono } from 'hono'
import { schemas } from '../lib/db.ts'
import {
  byCodeListRouter,
  dateRangeListRouter,
  periodListRouter,
  plainListRouter
} from '../lib/route-builders.ts'
import type { Env } from '../lib/types.ts'

export const tradingRouter = new Hono<{ Bindings: Env }>()

// Plain list (no filter)
tradingRouter.route('/summary', plainListRouter(schemas.tradeSummary))

// Date-filtered (single day)
tradingRouter.route(
  '/stock-summary',
  dateRangeListRouter(schemas.stockSummary, schemas.stockSummary.date)
)
tradingRouter.route(
  '/broker-summary',
  dateRangeListRouter(schemas.brokerSummary, schemas.brokerSummary.date)
)

// Period-filtered (year + month)
tradingRouter.route('/top-gainer', periodListRouter(schemas.topGainer, schemas.topGainer.period))
tradingRouter.route('/top-loser', periodListRouter(schemas.topLoser, schemas.topLoser.period))
tradingRouter.route(
  '/domestic',
  periodListRouter(schemas.domesticTrading, schemas.domesticTrading.period)
)
tradingRouter.route(
  '/foreign',
  periodListRouter(schemas.foreignTrading, schemas.foreignTrading.period)
)
tradingRouter.route(
  '/active-volume',
  periodListRouter(schemas.activeVolume, schemas.activeVolume.period)
)
tradingRouter.route(
  '/active-value',
  periodListRouter(schemas.activeValue, schemas.activeValue.period)
)
tradingRouter.route(
  '/active-frequency',
  periodListRouter(schemas.activeFrequency, schemas.activeFrequency.period)
)
tradingRouter.route(
  '/industry',
  periodListRouter(schemas.industryTrading, schemas.industryTrading.period)
)

// Code-filtered (company-scoped)
tradingRouter.route(
  '/company/:code/daily',
  byCodeListRouter(schemas.tradingDaily, schemas.tradingDaily.code)
)
tradingRouter.route(
  '/company/:code/summary',
  byCodeListRouter(schemas.tradingSS, schemas.tradingSS.code)
)
