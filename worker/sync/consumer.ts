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
import { syncForeignTrading } from './foreign-trading.ts'
import { syncDomesticTrading } from './domestic-trading.ts'
import { syncSectoralMovement } from './sectoral-movement.ts'
import { syncDailyIndex } from './daily-index.ts'
import { syncIndustryTrading } from './industry-trading.ts'
import { syncAdditionalListing } from './additional-listing.ts'
import { syncCompanyDelisting } from './company-delisting.ts'
import { syncCompanyDividend } from './company-dividend.ts'
import { syncFinancialRatio } from './financial-ratio.ts'
import { syncNewListing } from './new-listing.ts'
import { syncRightOffering } from './right-offering.ts'
import { syncStockSplit } from './stock-split.ts'
import { syncActiveFrequency, syncActiveValue, syncActiveVolume } from './active-stocks.ts'
import { syncMarketCalendar } from './market-calendar.ts'
import { syncStockSummary } from './stock-summary.ts'
import { syncBrokerSummary } from './broker-summary.ts'
import { syncIndexSummary } from './index-summary.ts'
import { syncCompanyAnnouncement } from './company-announcement.ts'
import { syncKseiOwnership } from './ksei-ownership.ts'

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
    case 'topGainer':
    case 'topLoser':
    case 'foreignTrading':
    case 'domesticTrading':
    case 'sectoralMovement':
    case 'dailyIndex':
    case 'industryTrading':
    case 'additionalListing':
    case 'companyDelisting':
    case 'companyDividend':
    case 'financialRatio':
    case 'newListing':
    case 'rightOffering':
    case 'stockSplit':
    case 'activeFrequency':
    case 'activeValue':
    case 'activeVolume': {
      requirePeriod(job.kind, params)
      const y = params.year as number
      const m = params.month as number
      const r = await dispatchPeriod(job.kind, env, client, y, m)
      return logDone(job.kind, r.count)
    }

    // Date-based (single YYYYMMDD)
    case 'marketCalendar':
    case 'stockSummary':
    case 'brokerSummary':
    case 'indexSummary':
    case 'companyAnnouncement':
    case 'kseiOwnership': {
      const date = params.date
      if (!date) throw new Error(`${job.kind} requires params.date (YYYYMMDD)`)
      const r = await dispatchDate(job.kind, env, client, date)
      return logDone(job.kind, r.count)
    }

    // TODO per-ticker recursive: companyDetail, indexChart, tradingDaily,
    // tradingSS, financialReport, issuedHistory — need queue fan-out
    // (one message per ticker) since each takes ~500ms × ~950 tickers.
    default:
      throw new Error(`unhandled sync kind: ${job.kind}`)
  }
}

async function dispatchPeriod(
  kind: SyncJob['kind'],
  env: Env,
  client: IdxClient,
  year: number,
  month: number
): Promise<{ count: number }> {
  switch (kind) {
    case 'topGainer': return syncTopGainer(env.DB, client, year, month)
    case 'topLoser': return syncTopLoser(env.DB, client, year, month)
    case 'foreignTrading': return syncForeignTrading(env.DB, client, year, month)
    case 'domesticTrading': return syncDomesticTrading(env.DB, client, year, month)
    case 'sectoralMovement': return syncSectoralMovement(env.DB, client, year, month)
    case 'dailyIndex': return syncDailyIndex(env.DB, client, year, month)
    case 'industryTrading': return syncIndustryTrading(env.DB, client, year, month)
    case 'additionalListing': return syncAdditionalListing(env.DB, client, year, month)
    case 'companyDelisting': return syncCompanyDelisting(env.DB, client, year, month)
    case 'companyDividend': return syncCompanyDividend(env.DB, client, year, month)
    case 'financialRatio': return syncFinancialRatio(env.DB, client, year, month)
    case 'newListing': return syncNewListing(env.DB, client, year, month)
    case 'rightOffering': return syncRightOffering(env.DB, client, year, month)
    case 'stockSplit': return syncStockSplit(env.DB, client, year, month)
    case 'activeFrequency': return syncActiveFrequency(env.DB, client, year, month)
    case 'activeValue': return syncActiveValue(env.DB, client, year, month)
    case 'activeVolume': return syncActiveVolume(env.DB, client, year, month)
    default: throw new Error(`unsupported period kind: ${kind}`)
  }
}

async function dispatchDate(
  kind: SyncJob['kind'],
  env: Env,
  client: IdxClient,
  date: string
): Promise<{ count: number }> {
  switch (kind) {
    case 'marketCalendar': return syncMarketCalendar(env.DB, client, date)
    case 'stockSummary': return syncStockSummary(env.DB, client, date)
    case 'brokerSummary': return syncBrokerSummary(env.DB, client, date)
    case 'indexSummary': return syncIndexSummary(env.DB, client, date)
    case 'companyAnnouncement': return syncCompanyAnnouncement(env.DB, client, date)
    case 'kseiOwnership': return syncKseiOwnership(env.DB, client, date)
    default: throw new Error(`unsupported date kind: ${kind}`)
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
