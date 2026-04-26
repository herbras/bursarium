// Cookie warmer — uses Cloudflare Browser Rendering to obtain a fresh
// IDX session that survives bot challenges.
//
// Use sparingly. Free Explorer tier: 10 browser hours / month total.
// Each warm = ~15-30s = budget for ~1200-2400 warms/month if needed,
// but typical usage is ONCE per cron run = ~30 per month.
//
// Falls back to Workers fetch if BROWSER binding is unavailable
// (e.g., local dev without --remote).

import puppeteer from '@cloudflare/puppeteer'
import type { Env } from './types.ts'
import {
  getCachedCookies,
  setCachedCookies,
  type CachedCookies
} from './cookie-cache.ts'

const HOMEPAGE_NAV_TIMEOUT_MS = 25_000
const COOKIE_NAMES_OF_INTEREST = ['__cf_bm', '_cfuvid', 'auth.strategy']

export interface WarmResult {
  source: CachedCookies['source']
  cookieHeader: string
  durationMs: number
  cookieCount: number
}

// Ensure cookies in KV are not older than `maxAgeMs`. If they are,
// re-warm. Returns the cookies that should be used.
export async function ensureFreshCookies(
  env: Env,
  options: { maxAgeMs?: number; force?: boolean } = {}
): Promise<{ cached: CachedCookies | null; warmed: WarmResult | null }> {
  const maxAgeMs = options.maxAgeMs ?? 20 * 60 * 1000
  const cached = await getCachedCookies(env.COOKIE_KV)
  const isFresh =
    cached !== null &&
    !options.force &&
    Date.now() - cached.obtainedAt < maxAgeMs

  if (isFresh) {
    return { cached, warmed: null }
  }

  const warmed = await warmCookies(env)
  return { cached, warmed }
}

// Force-warm cookies. Workers fetch is preferred — empirically returns
// 3 cookies (__cf_bm + _cfuvid + auth.strategy) which IDX endpoints
// require, vs Browser Rendering returning only 1. Browser is fallback
// only if Workers fetch returns thin or empty cookies.
export async function warmCookies(env: Env): Promise<WarmResult> {
  const start = Date.now()

  // Path A: Workers fetch (preferred — fast, complete cookie set)
  let cookieHeader = await warmViaWorkersFetch(env.IDX_BASE_URL)
  let count = countCookies(cookieHeader)

  // Path B: Browser fallback if WF gave us suspiciously few cookies
  if (count < 2 && env.BROWSER) {
    try {
      const browserCookies = await warmViaBrowser(env)
      const browserCount = countCookies(browserCookies)
      if (browserCount > count) {
        cookieHeader = browserCookies
        count = browserCount
      }
      await setCachedCookies(env.COOKIE_KV, cookieHeader, 'browser-rendering')
      return {
        source: 'browser-rendering',
        cookieHeader,
        durationMs: Date.now() - start,
        cookieCount: count
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`[cookie-warmer] browser fallback failed: ${reason}`)
    }
  }

  await setCachedCookies(env.COOKIE_KV, cookieHeader, 'workers-fetch')
  return {
    source: 'workers-fetch',
    cookieHeader,
    durationMs: Date.now() - start,
    cookieCount: count
  }
}

async function warmViaBrowser(env: Env): Promise<string> {
  // env.BROWSER is asserted by caller
  const browser = await puppeteer.launch(env.BROWSER as Parameters<typeof puppeteer.launch>[0])
  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
    )
    await page.goto(`${env.IDX_BASE_URL}/id`, {
      waitUntil: 'domcontentloaded',
      timeout: HOMEPAGE_NAV_TIMEOUT_MS
    })
    // Brief wait for client-side cookie setting (CF challenge JS).
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const cookies = await page.cookies()
    return cookies
      .filter((c) => COOKIE_NAMES_OF_INTEREST.some((n) => c.name === n) || c.name.startsWith('_cf'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
  } finally {
    await browser.close()
  }
}

async function warmViaWorkersFetch(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/id`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
    }
  })
  const cookies: string[] = []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') cookies.push(value)
  })
  await response.body?.cancel()
  // Take only the cookie name=value (strip Path/Expires/etc.)
  return cookies
    .map((c) => c.split(';')[0]?.trim())
    .filter((c): c is string => Boolean(c))
    .join('; ')
}

function countCookies(header: string): number {
  if (!header) return 0
  return header.split(';').filter((s) => s.trim().length > 0).length
}
