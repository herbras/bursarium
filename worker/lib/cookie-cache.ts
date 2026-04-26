// KV-backed cache for IDX session cookies.
//
// Why: IDX sits behind Cloudflare bot management. A direct Workers fetch
// often works (because Workers→CF is friendly), but to be resilient we
// cache the bot-management cookies (`__cf_bm`, `_cfuvid`) once obtained
// and reuse them across all sync consumers within the cookie's lifetime.
//
// Cookie lifetime: __cf_bm is typically 30 minutes. We cache 25 minutes
// to leave a safety margin before expiry.
//
// Source of cookies (in order of preference):
//   1. Workers fetch — cheap, fast (used as long as IDX accepts it)
//   2. Browser Rendering — fallback when Workers fetch starts failing

import type { KVNamespace } from '@cloudflare/workers-types'

const KEY = 'idx-cookies-v1'
const TTL_SECONDS = 25 * 60

export interface CachedCookies {
  cookieHeader: string
  obtainedAt: number
  expiresAt: number
  source: 'workers-fetch' | 'browser-rendering'
}

export async function getCachedCookies(
  kv: KVNamespace | undefined
): Promise<CachedCookies | null> {
  if (!kv) return null
  const value = await kv.get<CachedCookies>(KEY, 'json')
  if (!value) return null
  if (value.expiresAt < Date.now()) return null
  return value
}

export async function setCachedCookies(
  kv: KVNamespace | undefined,
  cookieHeader: string,
  source: CachedCookies['source']
): Promise<CachedCookies | null> {
  if (!kv) return null
  const now = Date.now()
  const value: CachedCookies = {
    cookieHeader,
    obtainedAt: now,
    expiresAt: now + TTL_SECONDS * 1000,
    source
  }
  await kv.put(KEY, JSON.stringify(value), { expirationTtl: TTL_SECONDS })
  return value
}

export async function clearCachedCookies(kv: KVNamespace | undefined): Promise<void> {
  if (!kv) return
  await kv.delete(KEY)
}
