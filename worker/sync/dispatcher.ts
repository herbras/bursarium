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

// IDX market hours (WIB):
//   Mon-Fri 09:00-11:30 (Session 1), 13:30-16:00 (Session 2)
// Live data we want refreshed hourly during market hours.
const INTRADAY_KINDS: SyncJob['kind'][] = [
  'indexList', // IHSG, LQ45, dll — moves live every minute
  'stockScreener' // PER, PBV, ROE recalc when prices move
]

// End-of-day syncs at 18:00 WIB — final close + summaries that
// don't move intraday or are heavy.
const DAILY_KINDS: SyncJob['kind'][] = [
  'companyProfile',
  'securityStock',
  'companySuspend',
  'companyRelisting',
  'tradeSummary',
  'dealerParticipant',
  'profileParticipant',
  'brokerParticipant'
]

// Date-based syncs — fired daily 18:00 WIB with date = today (YYYYMMDD).
const DAILY_DATE_KINDS: SyncJob['kind'][] = [
  'companyAnnouncement',
  'stockSummary',
  'brokerSummary',
  'indexSummary',
  'marketCalendar'
]

// Month-1 02:00 WIB — aggregations parametric on year/month.
const MONTHLY_KINDS: SyncJob['kind'][] = [
  'additionalListing',
  'companyDelisting',
  'companyDividend',
  'financialRatio',
  'newListing',
  'rightOffering',
  'stockSplit',
  'topGainer',
  'topLoser',
  'foreignTrading',
  'domesticTrading',
  'industryTrading',
  'sectoralMovement',
  'dailyIndex',
  'activeFrequency',
  'activeValue',
  'activeVolume'
]

export async function handleScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const cron = controller.cron
  console.log(`[scheduled] cron=${cron} scheduledTime=${controller.scheduledTime}`)

  // Compute which jobs apply based on current WIB time.
  const jobs = computeJobsForTime(controller.scheduledTime)

  if (jobs.length === 0) {
    console.log('[scheduled] no jobs for this time slot — exit cheap')
    return
  }

  // Warm cookies only when we'll actually fan out work.
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

  await enqueueAll(env, jobs)
}

// Time-aware dispatch — single hourly cron, decides which kinds based on WIB.
//
// Schedule:
//   - INTRADAY: 09:00-16:00 WIB Mon-Fri (8 fires per market day)
//   - DAILY:    18:00 WIB every day
//   - MONTHLY:  18:00 WIB on day 1 of month (sync previous month)
export function computeJobsForTime(scheduledTime: number): SyncJob[] {
  const wib = new Date(scheduledTime + 7 * 60 * 60 * 1000) // UTC -> WIB
  const wibDayOfWeek = wib.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const wibHour = wib.getUTCHours()
  const wibDay = wib.getUTCDate()

  const isWeekday = wibDayOfWeek >= 1 && wibDayOfWeek <= 5
  const isMarketHour = isWeekday && wibHour >= 9 && wibHour <= 16
  const isCloseSync = wibHour === 18 // covers Sun-Sat for static-ish data
  const isMonthStart = wibDay === 1

  const jobs: SyncJob[] = []

  if (isMarketHour) {
    for (const kind of INTRADAY_KINDS) jobs.push({ kind })
  }

  if (isCloseSync) {
    for (const kind of DAILY_KINDS) jobs.push({ kind })

    // Date-based daily kinds — fire with today (the just-closed trading day).
    const todayYmd = formatYmd(wib)
    for (const kind of DAILY_DATE_KINDS) {
      jobs.push({ kind, params: { date: todayYmd } })
    }

    if (isMonthStart) {
      // Sync the *previous* full month (current month is incomplete)
      const target = new Date(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1)
      const year = target.getUTCFullYear()
      const month = target.getUTCMonth() + 1
      for (const kind of MONTHLY_KINDS) {
        jobs.push({ kind, params: { year, month } })
      }
    }
  }

  return jobs
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
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
