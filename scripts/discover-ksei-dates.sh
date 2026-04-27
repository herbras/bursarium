#!/usr/bin/env bash
# For each month from start..end, probe candidate end-of-month dates
# and emit the one that returns HTTP 200 from KSEI.
# Usage: ./scripts/discover-ksei-dates.sh 2023-01 2026-03

set -euo pipefail

start="${1:-2023-01}"
end="${2:-2026-03}"

cur="$start"
while [[ "$cur" < "$(date -j -v+1m -f "%Y-%m" "$end" "+%Y-%m" 2>/dev/null || echo 9999)" ]]; do
  year="${cur%-*}"
  month="${cur#*-}"
  found=""
  for day in 31 30 29 28 27 26 25; do
    yyyymmdd="${year}${month}${day}"
    # Validate calendar date
    if ! date -j -f "%Y%m%d" "$yyyymmdd" "+%Y%m%d" >/dev/null 2>&1; then
      continue
    fi
    s=$(curl -sI -o /dev/null -w "%{http_code}" --max-time 8 \
      "https://web.ksei.co.id/Download/BalanceposEfek${yyyymmdd}.zip")
    if [ "$s" = "200" ]; then
      echo "$yyyymmdd"
      found=1
      break
    fi
  done
  if [ -z "$found" ]; then
    echo "# WARN no file for $cur" >&2
  fi
  # Increment month
  cur=$(date -j -v+1m -f "%Y-%m" "$cur" "+%Y-%m" 2>/dev/null || break)
done
