#!/usr/bin/env node
// Local KSEI backfill — parses ZIPs locally (uses laptop CPU instead of
// Worker's 10s budget), POSTs already-parsed rows in 500-row chunks to
// /_test/ksei-bulk on the deployed Worker.
//
// Usage:
//   BURSARIUM_TOKEN=... ./scripts/backfill-ksei-local.mjs 20240131 20240229 ...
//   echo "20240131" | BURSARIUM_TOKEN=... ./scripts/backfill-ksei-local.mjs

import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync, existsSync } from 'node:fs'

const WORKER = process.env.BURSARIUM_URL || 'https://bursarium.sarbeh.com'
const TOKEN = process.env.BURSARIUM_TOKEN || ''
if (!TOKEN) {
  console.error('Set BURSARIUM_TOKEN env var')
  process.exit(1)
}

const CHUNK = 500
const KSEI_BASE = 'https://web.ksei.co.id/Download'

const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
}

function parseKseiDate(s) {
  const [d, mon, y] = s.split('-')
  if (!d || !mon || !y) return 0
  const month = MONTH_MAP[mon.toUpperCase()]
  if (month === undefined) return 0
  return Date.UTC(Number(y), month, Number(d))
}

function num(s) {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

async function fetchZip(date) {
  const url = `${KSEI_BASE}/BalanceposEfek${date}.zip`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`KSEI ${date}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

function parseTxt(txt, date) {
  const lines = txt.split(/\r?\n/)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const c = line.split('|')
    if (c.length < 25) continue
    const code = c[1]?.trim()
    const type = c[2]?.trim()
    const ds = c[0]?.trim()
    if (!code || !type || !ds) continue
    const reportDate = parseKseiDate(ds)
    if (!reportDate) continue
    const totalShares = num(c[3])
    if (totalShares === null) continue
    rows.push({
      id: `${code}-${date}`,
      code, type, reportDate, totalShares,
      price: num(c[4]),
      localIs: num(c[5]),  localCp: num(c[6]),  localPf: num(c[7]),
      localIb: num(c[8]),  localId: num(c[9]),  localMf: num(c[10]),
      localSc: num(c[11]), localFd: num(c[12]), localOt: num(c[13]),
      localTotal: num(c[14]),
      foreignIs: num(c[15]), foreignCp: num(c[16]), foreignPf: num(c[17]),
      foreignIb: num(c[18]), foreignId: num(c[19]), foreignMf: num(c[20]),
      foreignSc: num(c[21]), foreignFd: num(c[22]), foreignOt: num(c[23]),
      foreignTotal: num(c[24])
    })
  }
  return rows
}

async function postChunk(rows) {
  const res = await fetch(`${WORKER}/_test/ksei-bulk?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.status !== 'ok') {
    throw new Error(`bulk insert failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body
}

async function ingest(date) {
  console.log(`=== ${date} ===`)
  const t0 = Date.now()
  const zipBytes = await fetchZip(date)
  const files = unzipSync(zipBytes)
  const txtName = Object.keys(files).find((n) => n.endsWith('.txt'))
  const txt = strFromU8(files[txtName])
  const rows = parseTxt(txt, date)
  console.log(`  parsed ${rows.length} rows locally in ${Date.now() - t0}ms`)
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const r = await postChunk(slice)
    written += r.result?.count ?? 0
    process.stdout.write(`  chunk ${i}..${Math.min(i + CHUNK, rows.length)}: ${r.result?.count} rows (${r.durationMs}ms)\n`)
  }
  console.log(`  total ${written}/${rows.length} rows written (${Date.now() - t0}ms total)`)
  return written
}

const dates = []
const args = process.argv.slice(2)
if (args.length > 0) dates.push(...args)
else {
  // read stdin
  const stdin = readFileSync(0, 'utf8')
  for (const line of stdin.split('\n')) {
    const t = line.trim()
    if (/^\d{8}$/.test(t)) dates.push(t)
  }
}

if (dates.length === 0) {
  console.error('Usage: BURSARIUM_TOKEN=... ./backfill-ksei-local.mjs YYYYMMDD [...]')
  process.exit(1)
}

let total = 0
for (const date of dates) {
  try {
    total += await ingest(date)
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
  }
}
console.log(`\n=== done: ${total} rows across ${dates.length} dates ===`)
