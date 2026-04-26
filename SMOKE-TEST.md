# Smoke Test — validate before bulk porting

Three checks to run **before** investing 4-5 days porting all routes & syncs.
Each check answers a "kill question" — if it fails, pivot architecture.

## Why these three

| Check | Kill question | If fails → |
|-------|---------------|-----------|
| 1. IP egress | Does IDX accept requests from Cloudflare egress? | Pivot to hybrid VPS for sync, Workers only for API |
| 2. End-to-end sync | Does one sync write valid data into D1? | Debug Drizzle/D1 quirks before porting more |
| 3. Dataset size | Will full dataset fit in D1 free 5GB? | Plan for paid D1 ($5/mo) or Turso |

## Setup (one-time)

```bash
cd ~/Documents/NeaByteLab/IDX-API

# 1. Install
npm install

# 2. Login + create CF resources
wrangler login
wrangler d1 create idx-api          # copy database_id into wrangler.toml
wrangler queues create idx-sync
wrangler queues create idx-sync-dlq

# 3. Apply schema to local D1 (no remote yet — keep test isolated)
npm run db:generate
npm run db:migrate:local

# 4. Set diagnostic token for local dev
echo 'DIAG_TOKEN="smoke-test-2026"' > .dev.vars
```

## Local test (cheap, but NOT IP-conclusive)

`wrangler dev` runs locally — `fetch` calls go from YOUR machine, not from
CF edge. Use this only to verify code paths, not IP egress.

```bash
npm run dev
# in another terminal:
curl 'http://localhost:8787/_test/idx-fetch?token=smoke-test-2026' | jq
curl 'http://localhost:8787/_test/cookie-status?token=smoke-test-2026' | jq
curl 'http://localhost:8787/_test/warm-cookies?token=smoke-test-2026' | jq
curl 'http://localhost:8787/_test/run-sync?token=smoke-test-2026&kind=indexList' | jq
curl 'http://localhost:8787/_test/dataset-size?token=smoke-test-2026' | jq
```

### Cookie warmer-specific checks

```jsonc
// /_test/cookie-status (initial — empty)
{ "cached": false, "hasKv": true, "hasBrowser": true, "message": "no cached cookies" }

// /_test/warm-cookies (force warm; tries Browser, falls back to fetch)
{ "status": "ok", "source": "browser-rendering", "durationMs": 20264, "cookieCount": 3 }

// /_test/cookie-status (after warm)
{
  "cached": true,
  "source": "browser-rendering",
  "ageMs": 75,
  "ttlRemainingMs": 1499925,    // ≈ 25 min
  "cookieCount": 3,
  "cookieNames": ["_cfuvid", "__cf_bm", "auth.strategy"]
}

// /_test/run-sync (uses cached cookies if present)
{
  "kind": "indexList",
  "status": "ok",
  "durationMs": 190,             // 3x faster than 624ms without cache
  "usedCachedCookies": true,
  "cookieSource": "browser-rendering",
  "result": { "count": 45 }
}

// DELETE /_test/cookie-status (clear cache to retest miss path)
curl -X DELETE 'http://localhost:8787/_test/cookie-status?token=...'
// → { "status": "cleared" }
```

Local pass = code is sane. Doesn't prove CF IP works.

## Production smoke test (the real signal)

To validate IP egress, **must deploy** and call the deployed Worker.

```bash
# Deploy the skeleton
wrangler secret put DIAG_TOKEN     # paste a strong random string
wrangler deploy
# → returns https://idx-api.<your-subdomain>.workers.dev

# Run the same three curls against the deployed URL
TOKEN="<the secret you just set>"
WORKER="https://idx-api.<your-subdomain>.workers.dev"

curl "$WORKER/_test/idx-fetch?token=$TOKEN" | jq
curl "$WORKER/_test/run-sync?token=$TOKEN&kind=indexList" | jq
curl "$WORKER/_test/dataset-size?token=$TOKEN" | jq
```

## How to read the results

### Check 1: `/_test/idx-fetch`

```jsonc
{
  "summary": "ok",                  // or "blocked" or "partial"
  "interpretation": "...",
  "checks": [
    {
      "url": "https://www.idx.co.id/id",
      "status": 200,                // ✅ 200 OK = green light
      "ok": true,
      "durationMs": 380,
      "bodySnippet": "<!DOCTYPE...", // looks like real IDX HTML
      "cookies": ["TS01ce...", ...],// IDX issued session cookies
      "cfRay": null                 // null = response NOT served by CF (good — IDX direct)
    }
  ]
}
```

**Pass**: `summary: "ok"` AND both checks return 200 with real-looking HTML/JSON.
**Fail (blocked)**: 403 / 451 / 401, or HTML body contains "Access Denied" /
"Cloudflare detected suspicious activity". → IDX blocks CF range. **Stop, pivot.**
**Fail (partial)**: Home page 200 but API endpoint 403. → cookie issue or
rate-limited. Inspect response body. May still be salvageable.

### Check 2: `/_test/run-sync?kind=indexList`

```jsonc
{
  "kind": "indexList",
  "status": "ok",
  "durationMs": 1840,                // < 5s = healthy on first call
  "result": { "count": 31 }          // 31 indices written to D1
}
```

**Pass**: `status: "ok"`, `count > 0`. Re-run `/_test/dataset-size` to
confirm rows landed.
**Fail**: `status: "error"` with detail. Common failures:
- "fetch failed" → IP issue (overlap with Check 1)
- "D1_ERROR: no such table" → forgot `db:migrate:local` or `:remote`
- "ConflictDoUpdate ..." → schema/PK mismatch, rare

### Check 3: `/_test/dataset-size`

```jsonc
{
  "tableCount": 38,
  "totalRows": 31,                   // after only indexList sync
  "freeTierLimit": "5 GB storage / 5M reads/day / 100K writes/day",
  "interpretation": "Well under free tier. Stay on D1 free.",
  "counts": {
    "indexList": 31,
    "companyProfile": 0,
    ...
  }
}
```

After ONE sync, you only see indexList populated — that's expected.
**Real signal comes after a full sync run** (which we haven't ported yet).
For now, it just confirms the count query works against all 38 tables.

## Decision tree after smoke test

```
Check 1 PASS + Check 2 PASS
  → Workers viable. Lanjut bulk port routes + syncs.

Check 1 PASS + Check 2 FAIL
  → Code/D1 issue, not architecture. Debug specific error.
     Workers + Hono path masih valid.

Check 1 FAIL (IDX blocks CF)
  → Hybrid: keep API on Workers, move sync to VPS.
     ~1 day extra setup. Workers code we built isn't wasted —
     keep routes + helpers + schemas, swap out sync part.

Check 1 PARTIAL (rate-limit, weird headers)
  → Try cookie cache via KV, slow request rate, retry-with-backoff.
     If still flaky, pivot to hybrid.
```

## What this DOESN'T test (yet)

- Full sync of 38 jobs over weeks of date range — that's the real load.
  Wait until at least 5 syncs are ported before attempting.
- D1 write throughput at scale — first run is single-digit indices.
- Cron Trigger reliability — only matters once cron fires for real.
- Queue retry / DLQ behavior — only triggered on consumer failures.

## Cleanup

After smoke testing:
```bash
# Remove diagnostic token to disable /_test/* in production
wrangler secret delete DIAG_TOKEN
# Or leave it set with a strong token — it's gated, just don't share the token
```

The endpoints stay in code (small bytes) but become 404 once `DIAG_TOKEN`
is unset. They're useful again whenever you need to investigate.
