// Cloudflare Worker entry — Hono app + scheduled + queue handlers.
//
// Bindings (see wrangler.toml):
//   - DB:          D1 database
//   - SYNC_QUEUE:  outbound queue (producer side)
//   - IDX_BASE_URL, LOG_LEVEL: vars
//
// Three handlers in one Worker file:
//   1. fetch     — Hono router for HTTP API requests
//   2. scheduled — Cron Trigger fan-out to queue
//   3. queue     — Consumer that runs one sync per message

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { healthRouter } from './routes/health.ts'
import { resourceRouter } from './routes/resource-tree.ts'
import { companiesRouter } from './routes/companies.ts'
import { securitiesRouter } from './routes/securities.ts'
import {
  relistingRouter,
  stockScreenerRouter,
  suspendRouter
} from './routes/simple.ts'
import { diagnosticsRouter } from './routes/diagnostics.ts'
import { handleScheduled } from './sync/dispatcher.ts'
import { handleQueue } from './sync/consumer.ts'
import type { Env, SyncJob } from './lib/types.ts'
import type { ExecutionContext, ScheduledController, MessageBatch } from '@cloudflare/workers-types'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: '*' }))
app.use('*', honoLogger())

app.route('/', resourceRouter)
app.route('/health', healthRouter)
app.route('/companies', companiesRouter)
app.route('/securities', securitiesRouter)
app.route('/stock-screener', stockScreenerRouter)
app.route('/suspend', suspendRouter)
app.route('/relisting', relistingRouter)
app.route('/_test', diagnosticsRouter)

app.notFound((c) => c.json({ error: 'not found' }, 404))
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : 'internal error'
  console.error('[hono] unhandled error:', err)
  return c.json({ error: message }, 500)
})

export default {
  fetch: app.fetch,

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(controller, env))
  },

  async queue(batch: MessageBatch<SyncJob>, env: Env): Promise<void> {
    await handleQueue(batch, env)
  }
}
