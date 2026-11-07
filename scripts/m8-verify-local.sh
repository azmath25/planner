#!/usr/bin/env bash
# Dayframe M8.3: nonpublishing, local/disposable release validation.
# NEVER connects to live Neon or calls gcloud. Requires Node 24+, npm, Python,
# Playwright Chromium and a disposable PostgreSQL 16 at localhost:5432.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo "Dayframe M8.3 non-deploying release gate"
node -e 'if(+process.versions.node.split(".")[0]<24)process.exit(1)'
if [[ ! -s package-lock.json ]]; then
  echo "BLOCKED: package-lock.json missing. Generate and review a lockfile in a trusted dependency-enabled environment." >&2
  exit 3
fi
npm ci --no-audit --no-fund
npm run test:source
npm run test:time
npm run test:documents
node --experimental-strip-types --test tests/timeReports.test.mjs tests/timeInsights.test.mjs tests/reportCsv.test.mjs
npm run test:api
npm run typecheck
npm run build
npm run check:dist
npm audit --omit=dev --audit-level=high
# Restrict database test to an exact LOCAL disposable audit identity. The suite
# repeats this guard and never accepts a production/remote DATABASE_URL.
export PG_AUDIT_URL="${PG_AUDIT_URL:-postgres://audit:auditpass@127.0.0.1:5432/dayframe_audit}"
if [[ "$PG_AUDIT_URL" != "postgres://audit:auditpass@127.0.0.1:5432/dayframe_audit" ]]; then
  echo "Refusing non-disposable PostgreSQL connection" >&2;exit 4
fi
unset DATABASE_URL
node --test tests/deep-postgres-regression.mjs
# Use installed Playwright + Chromium; no browsers are downloaded by this
# script. The operator owns setup of disposable tools beforehand.
python -c 'import playwright.sync_api'
for suite in \
 tests/smoke.py tests/appearance.py tests/timer-browser.py \
 tests/m3-browser.py tests/workspace-archive-browser.py \
 tests/m4-daily-pool-browser.py tests/m42-timed-browser.py \
 tests/m43-reminders-browser.py tests/m51-time-browser.py \
 tests/m52-rollups-browser.py tests/m53-week-browser.py \
 tests/m61-notes-browser.py tests/m62-documents-browser.py \
 tests/m71-home-browser.py tests/m72-period-browser.py \
 tests/m72-reports-browser.py tests/m73-insights-browser.py; do
  echo "RUN $suite"
  python "$suite"
done
echo "PASS: all automated Dayframe M8.3 local gates."
echo "Still required: manual Safari, permission, account-switch and PWA installation signoff."
