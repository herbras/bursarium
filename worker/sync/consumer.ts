// Queue consumer — runs one sync per message.
//
// Each message has shape { kind, params? }. Consumer dispatches to the
// matching sync function. Failures throw -> message is retried per
// `max_retries` in wrangler.toml. After exhaustion the message lands in
// the DLQ for manual inspection.

import type { MessageBatch } from '@cloudflare/workers-types'
import { IdxClient } from '../lib/client.ts'
import { getCachedCookies } from '../lib/cookie-cache.ts'
import type { Env, SyncJob } from '../lib/types.ts'
import { syncIndexList } from './index-list.ts'

export async function handleQueue(batch: MessageBatch<SyncJob>, env: Env): Promise<void> {
  // Read cached cookies once per batch — feed them to the IdxClient so
  // it skips the homepage round-trip and works with a CF-challenged session.
  const cached = await getCachedCookies(env.COOKIE_KV)
  if (cached) {
    console.log(
      `[queue] using cached cookies from ${cached.source}, age ${Date.now() - cached.obtainedAt}ms`
    )
  } else {
    console.log('[queue] no cached cookies — IdxClient will fetch session itself')
  }
  const client = new IdxClient(env.IDX_BASE_URL, cached?.cookieHeader ?? '')

  for (const message of batch.messages) {
    const job = message.body
    try {
      await runJob(env, client, job)
      message.ack()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[queue] job=${job.kind} failed: ${reason}`)
      // Let Workers retry per max_retries; after exhaustion -> DLQ.
      message.retry({ delaySeconds: 30 })
    }
  }
}

async function runJob(env: Env, client: IdxClient, job: SyncJob): Promise<void> {
  console.log(`[queue] running ${job.kind}`, job.params ?? {})
  switch (job.kind) {
    case 'indexList': {
      const result = await syncIndexList(env.DB, client)
      console.log(`[queue] indexList done — ${result.count} rows`)
      return
    }
    // TODO: port the remaining ~37 sync jobs from src/Backend/Sync/.
    // Each receives (env.DB, client, job.params?) and follows the same
    // shape as syncIndexList.
    default:
      throw new Error(`unhandled sync kind: ${job.kind}`)
  }
}
