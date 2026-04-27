#!/usr/bin/env bash
# Backfill KSEI ownership for a list of YYYYMMDD dates.
# Usage:  ./scripts/backfill-ksei.sh 20260227 20260130 ...
# or pipe:  echo -e "20260227\n20260130" | ./scripts/backfill-ksei.sh
#
# Strategy: chunked sync via /_test/run-sync?...&offset=N&chunkLimit=500
# until totalAvailable rows persisted. Stays within Worker CPU per call.

set -euo pipefail

WORKER="${BURSARIUM_URL:-https://bursarium.sarbeh.com}"
TOKEN="${BURSARIUM_TOKEN:-$(cat /tmp/bursarium-diag-token.txt 2>/dev/null || echo '')}"
[ -z "$TOKEN" ] && { echo "set BURSARIUM_TOKEN env var"; exit 1; }

dates=("$@")
if [ ${#dates[@]} -eq 0 ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && dates+=("$line")
  done
fi
if [ ${#dates[@]} -eq 0 ]; then
  echo "Usage: $0 YYYYMMDD [YYYYMMDD...]"
  exit 1
fi

CHUNK=500
total_persisted=0

for date in "${dates[@]}"; do
  if ! [[ "$date" =~ ^[0-9]{8}$ ]]; then
    echo "skip invalid date: $date"
    continue
  fi
  echo "=== $date ==="

  # Phase 1: parse + cache. Returns total available, no D1 writes.
  parse=$(curl -s --max-time 30 \
    "${WORKER}/_test/run-sync?token=${TOKEN}&kind=kseiOwnership&date=${date}&parseOnly=1")
  if [[ "$parse" != *"\"status\":\"ok\""* ]]; then
    echo "  PARSE FAIL: ${parse:0:200}"
    continue
  fi
  total_avail=$(echo "$parse" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['totalAvailable'])" 2>/dev/null || echo 0)
  echo "  parsed: $total_avail rows cached"

  # Phase 2: persist chunks.
  offset=0
  while [ "$offset" -lt "$total_avail" ]; do
    r=$(curl -s --max-time 30 \
      "${WORKER}/_test/run-sync?token=${TOKEN}&kind=kseiOwnership&date=${date}&offset=${offset}&chunkLimit=${CHUNK}")
    if [[ "$r" == *"\"status\":\"ok\""* ]]; then
      n=$(echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['count'])" 2>/dev/null || echo 0)
      echo "  chunk ${offset}..$((offset+CHUNK)): $n rows"
      total_persisted=$((total_persisted + n))
    else
      echo "  chunk ${offset}: FAIL — ${r:0:200}"
      break
    fi
    offset=$((offset + CHUNK))
  done
done

echo
echo "=== done: ~$total_persisted rows persisted across ${#dates[@]} dates ==="
