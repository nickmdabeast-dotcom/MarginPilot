#!/usr/bin/env bash
# Test the CSV upload endpoint locally.
# Usage:  ./scripts/test-upload.sh [fixture]
# Fixtures: valid_commas (default), valid_weird_headers, valid_semicolon, invalid_missing_cols

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
COMPANY_ID="${COMPANY_ID:-00000000-0000-0000-0000-000000000001}"
FIXTURE="${1:-valid_commas}"
CSV_FILE="$(dirname "$0")/../data/${FIXTURE}.csv"

if [[ ! -f "$CSV_FILE" ]]; then
  echo "ERROR: fixture not found: $CSV_FILE"
  echo "Available fixtures:"
  ls "$(dirname "$0")/../data/"
  exit 1
fi

echo "=== Testing CSV upload ==="
echo "  URL:     $BASE_URL/api/jobs/upload"
echo "  Company: $COMPANY_ID"
echo "  File:    $CSV_FILE"
echo ""

curl -s -X POST "$BASE_URL/api/jobs/upload" \
  -F "file=@$CSV_FILE" \
  -F "company_id=$COMPANY_ID" \
  | jq .
