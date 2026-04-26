// /market/* — indices, calendar, daily-index, sectoral-movement, index-summary.
import { Hono } from 'hono'
import { schemas } from '../lib/db.ts'
import {
  dateRangeListRouter,
  periodListRouter,
  plainListRouter,
  byCodeListRouter
} from '../lib/route-builders.ts'
import type { Env } from '../lib/types.ts'

export const marketRouter = new Hono<{ Bindings: Env }>()

// /market/indices  + /market/indices/:code/chart
const indicesRouter = new Hono<{ Bindings: Env }>()
indicesRouter.route('/', plainListRouter(schemas.indexList))
indicesRouter.route(
  '/:code/chart',
  byCodeListRouter(schemas.indexChart, schemas.indexChart.code, {
    orderBy: { column: schemas.indexChart.date, direction: 'desc' },
    uppercase: false
  })
)
marketRouter.route('/indices', indicesRouter)

marketRouter.route('/calendar', dateRangeListRouter(schemas.marketCalendar, schemas.marketCalendar.date))
marketRouter.route('/daily-index', periodListRouter(schemas.dailyIndex, schemas.dailyIndex.period))
marketRouter.route(
  '/sectoral-movement',
  periodListRouter(schemas.sectoralMovement, schemas.sectoralMovement.period)
)
marketRouter.route('/index-summary', dateRangeListRouter(schemas.indexSummary, schemas.indexSummary.date))
