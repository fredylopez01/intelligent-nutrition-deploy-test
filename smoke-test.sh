#!/usr/bin/env bash
set -euo pipefail

# ------------------------------
# Smoke test del stack
# Verifica que la app está operativa tras un deployment
# ------------------------------

BASE_URL="${BASE_URL:-http://localhost:3000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_INTERVAL="${RETRY_INTERVAL:-2}"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

wait_for_url() {
  local url="$1"
  local count=0
  until curl -sf "$url" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$MAX_RETRIES" ]; then
      return 1
    fi
    sleep "$RETRY_INTERVAL"
  done
  return 0
}

echo "== Smoke test: $(date) =="

# 1. Health endpoint responde 200 sin token
if wait_for_url "$BASE_URL/health"; then
  pass "GET $BASE_URL/health -> 200"
else
  fail "GET $BASE_URL/health no responde tras $MAX_RETRIES intentos"
fi

# 2. Health endpoint retorna { status: 'ok' }
HEALTH_BODY=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo "")
if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass "Health body -> $HEALTH_BODY"
else
  fail "Health body inesperado: $HEALTH_BODY"
fi

# 3. Frontend responde 200
if wait_for_url "$FRONTEND_URL"; then
  pass "GET $FRONTEND_URL -> 200"
else
  fail "GET $FRONTEND_URL no responde tras $MAX_RETRIES intentos"
fi

echo ""
echo "Resultado: $PASS pass, $FAIL fail"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0