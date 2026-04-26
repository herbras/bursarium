// /data/* — corporate action streams (NEW IN BURSARIUM).
//
// Upstream advertised these in resource-tree but did not implement.
// All schemas exist in src/Backend/Schemas/ and are populated by
// existing sync jobs. This file exposes them as period-filtered lists.
import { Hono } from 'hono'
import { schemas } from '../lib/db.ts'
import { periodListRouter } from '../lib/route-builders.ts'
import type { Env } from '../lib/types.ts'

export const dataRouter = new Hono<{ Bindings: Env }>()

dataRouter.route(
  '/additional-listing',
  periodListRouter(schemas.additionalListing, schemas.additionalListing.period)
)
dataRouter.route(
  '/delisting',
  periodListRouter(schemas.companyDelisting, schemas.companyDelisting.period)
)
dataRouter.route(
  '/dividend',
  periodListRouter(schemas.companyDividend, schemas.companyDividend.period)
)
dataRouter.route(
  '/financial-ratio',
  periodListRouter(schemas.financialRatio, schemas.financialRatio.period)
)
dataRouter.route(
  '/new-listing',
  periodListRouter(schemas.newListing, schemas.newListing.period)
)
dataRouter.route(
  '/right-offering',
  periodListRouter(schemas.rightOffering, schemas.rightOffering.period)
)
dataRouter.route(
  '/stock-split',
  periodListRouter(schemas.stockSplit, schemas.stockSplit.period)
)
