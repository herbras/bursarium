import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as schemas from '../../src/Backend/Schemas/index.ts'

export type Database = DrizzleD1Database<typeof schemas>

// Build a Drizzle client bound to the request's D1 instance.
// Created per-request because Workers isolates may share a Worker instance
// across many requests but the D1 binding is request-scoped.
export function getDb(d1: D1Database): Database {
  return drizzle(d1, { schema: schemas, logger: false })
}

export { schemas }
