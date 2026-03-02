#!/usr/bin/env bash
# Test the CSV upload endpoint locally.
# Usage:  ./scripts/test-upload.sh [fixture]
# Fixtures: valid_commas (default), valid_weird_headers, valid_semicolon, invalid_missing_cols

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_COOKIE="${AUTH_COOKIE:-}"
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
echo "  File:    $CSV_FILE"
if [[ -n "$AUTH_COOKIE" ]]; then
  echo "  Cookie:  provided"
else
  echo "  Cookie:  not provided (request will return 401)"
fi
echo ""

COOKIE_ARGS=()
if [[ -n "$AUTH_COOKIE" ]]; then
  COOKIE_ARGS+=(-H "Cookie: $AUTH_COOKIE")
fi

curl -s -X POST "$BASE_URL/api/jobs/upload" \
  "${COOKIE_ARGS[@]}" \
  -F "file=@$CSV_FILE" \
  | jq .
