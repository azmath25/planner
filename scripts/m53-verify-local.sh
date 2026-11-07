#!/usr/bin/env bash
# M5.3 verification only. Does not deploy, push, change GitHub settings,
# modify Neon, or access credentials. Intended for local/Cloud Shell use
# while GitHub-hosted private-repository Actions runners are unavailable.
set -uo pipefail
cd "$(dirname "$0")/.."
echo "Dayframe M5.3 verification — $(git rev-parse --short HEAD)"
printf 'Branch: %s\n' "$(git branch --show-current)"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "This Dayframe repository is expected to use main only." >&2
  exit 2
fi
failed=0
missing=0
check(){
  local label="$1"; shift
  printf '\n===== %s =====\n' "$label"
  if "$@"; then
    printf 'PASS: %s\n' "$label"
  else
    printf 'FAIL: %s\n' "$label" >&2
    failed=$((failed+1))
  fi
}
if [[ "${M53_SKIP_INSTALL:-0}" != "1" ]]; then
  check "Install locked dependencies" npm ci --no-audit --no-fund
fi
if [[ ! -d node_modules ]]; then
  echo 'Dependencies are unavailable. No checks can run.' >&2
  exit 2
fi
check "Frontend source smoke" npm run test:source
check "Timer domain regression" npm run test:time
check "Backend API unit tests (including M5.3)" npm run test:api
check "TypeScript check" npm run typecheck
check "Build latest frontend" npm run build
check "Verify Pages dist" npm run check:dist
check "Build signed-in M5.3 browser harness" node tests/build-m53-harness.mjs
if [[ -f tests/.harness/m53-app.js ]]; then
  check "Check M5.3 harness JS" node --check tests/.harness/m53-app.js
fi
if python3 -c 'import playwright.sync_api' 2>/dev/null; then
  check "M5.3 responsive Playwright DOM regression" python3 tests/m53-week-browser.py
else
  echo 'NOT VERIFIED: Playwright Python package missing; run python3 -m pip install playwright && python3 -m playwright install chromium.' >&2
  missing=$((missing+1))
fi
if [[ -n "${PG_AUDIT_URL:-}" ]]; then
  # The regression test itself rejects every non-local/non-ephemeral URL.
  check "PostgreSQL migrations, ownership and concurrency" node --test tests/deep-postgres-regression.mjs
else
  echo 'NOT VERIFIED: isolated PostgreSQL suite (PG_AUDIT_URL not set to ephemeral local audit database).' >&2
  missing=$((missing+1))
fi
check "Production dependency-security advisories" npm audit --omit=dev --audit-level=high
printf '\nM5.3 verification summary: %s failed, %s not verified.\n' "$failed" "$missing"
if ((failed>0)); then exit 1; fi
if ((missing>0)); then exit 2; fi
echo 'All selected local checks passed. Live authenticated-device acceptance is still separate.'
