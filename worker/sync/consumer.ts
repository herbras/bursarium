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
import { syncCompanyProfile } from './company-profile.ts'
import { syncSecurityStock } from './security-stock.ts'
import { syncCompanyRelisting } from './company-relisting.ts'
import { syncCompanySuspend } from './company-suspend.ts'
import { syncStockScreener } from './stock-screener.ts'
import { syncTradeSummary } from './trade-summary.ts'
import {
  syncParticipantBroker,
  syncParticipantDealer,
  syncParticipantProfile
} from './participants.ts'
import { syncTopGainer, syncTopLoser } from './top-movers.ts'

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
  const params = job.params ?? {}

  switch (job.kind) {
    // Bulk / static-ish (no params)
    case 'indexList': {
      const r = await syncIndexList(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'companyProfile': {
      const r = await syncCompanyProfile(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'securityStock': {
      const r = await syncSecurityStock(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'companyRelisting': {
      const r = await syncCompanyRelisting(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'companySuspend': {
      const r = await syncCompanySuspend(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'stockScreener': {
      const r = await syncStockScreener(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'tradeSummary': {
      const r = await syncTradeSummary(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'brokerParticipant': {
      const r = await syncParticipantBroker(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'dealerParticipant': {
      const r = await syncParticipantDealer(env.DB, client)
      return logDone(job.kind, r.count)
    }
    case 'profileParticipant': {
      const r = await syncParticipantProfile(env.DB, client)
      return logDone(job.kind, r.count)
    }

    // Period-based (year + month)
    case 'topGainer': {
      requirePeriod(job.kind, params)
      const r = await syncTopGainer(env.DB, client, params.year!, params.month!)
      return logDone(job.kind, r.count)
    }
    case 'topLoser': {
      requirePeriod(job.kind, params)
      const r = await syncTopLoser(env.DB, client, params.year!, params.month!)
      return logDone(job.kind, r.count)
    }

    // TODO: remaining sync kinds — additionalListing, companyDelisting,
    // companyDividend, financialRatio, foreignTrading, domesticTrading,
    // industryTrading, activeFreq/Vol/Val, sectoralMovement, dailyIndex,
    // newListing, rightOffering, stockSplit, companyAnnouncement,
    // marketCalendar, stockSummary, brokerSummary, indexSummary,
    // financialReport, issuedHistory, indexChart, tradingDaily, tradingSS.
    default:
      throw new Error(`unhandled sync kind: ${job.kind}`)
  }
}

function logDone(kind: string, count: number): void {
  console.log(`[queue] ${kind} done — ${count} rows`)
}

function requirePeriod(kind: string, params: { year?: number; month?: number }): void {
  if (typeof params.year !== 'number' || typeof params.month !== 'number') {
    throw new Error(`${kind} requires params.year and params.month`)
  }
}
