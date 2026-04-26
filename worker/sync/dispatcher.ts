// Scheduled handler — translates Cron Trigger firings into Queue messages.
//
// Why split: a single Worker invocation has a CPU budget (30s on paid)
// and 1000 sub-request cap. The Deno `Cron.ts` runs ~30 syncs sequentially
// over weeks of date-range — that does NOT fit in one Worker invocation.
//
// Instead we enqueue one job per logical sync. Cloudflare Queues handle
// retries (up to max_retries, configurable in wrangler.toml) with a DLQ
// for poison messages.

import type { ScheduledController } from '@cloudflare/workers-types'
import { ensureFreshCookies } from '../lib/cookie-warmer.ts'
import type { Env, SyncJob } from '../lib/types.ts'

// Daily syncs: hot data refreshed every weekday after IDX close.
const DAILY_KINDS: SyncJob['kind'][] = [
  'companyProfile',
  'securityStock',
  'companySuspend',
  'companyRelisting',
  'tradeSummary',
  'dealerParticipant',
  'profileParticipant',
  'brokerParticipant',
  'indexList',
  'stockScreener',
  'companyAnnouncement'
]

// Monthly syncs: aggregations needing year/month parameters.
const MONTHLY_KINDS: SyncJob['kind'][] = [
  'additionalListing',
  'companyDelisting',
  'foreignTrading',
  'companyDividend',
  'financialRatio',
  'topGainer',
  'topLoser',
  'rightOffering',
  'industryTrading',
  'newListing',
  'stockSplit'
]

export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const cron = controller.cron
  console.log(`[scheduled] cron=${cron} scheduledTime=${controller.scheduledTime}`)

  // Warm IDX cookies ONCE before fanning out 11-22 sync jobs. Costs
  // ~1 browser-second; consumers reuse cached cookies via KV.
  try {
    const result = await ensureFreshCookies(env)
    if (result.warmed) {
      console.log(
        `[scheduled] warmed cookies via ${result.warmed.source} in ${result.warmed.durationMs}ms (${result.warmed.cookieCount} cookies)`
      )
    } else {
      console.log('[scheduled] cookies still fresh — skip warm')
    }
  } catch (err) {
    console.warn(
      `[scheduled] cookie warm failed: ${err instanceof Error ? err.message : String(err)} — proceeding without cache`
    )
  }

  // Cron expression match → which group to fan out
  if (cron === '30 11 * * *') {
    await enqueueAll(env, DAILY_KINDS.map((kind) => ({ kind })))
    return
  }

  if (cron === '0 19 1 * *') {
    const now = new Date(controller.scheduledTime)
    // Sync the *previous* month — current month likely incomplete
    const target = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    const year = target.getUTCFullYear()
    const month = target.getUTCMonth() + 1
    await enqueueAll(
      env,
      MONTHLY_KINDS.map((kind) => ({ kind, params: { year, month } }))
    )
    return
  }

  console.warn(`[scheduled] unknown cron expression: ${cron}`)
}

async function enqueueAll(env: Env, jobs: SyncJob[]): Promise<void> {
  // Workers Queue sendBatch caps at 100 messages per call.
  const batchSize = 100
  for (let i = 0; i < jobs.length; i += batchSize) {
    const slice = jobs.slice(i, i + batchSize)
    await env.SYNC_QUEUE.sendBatch(slice.map((body) => ({ body })))
  }
  console.log(`[scheduled] enqueued ${jobs.length} sync jobs`)
}
