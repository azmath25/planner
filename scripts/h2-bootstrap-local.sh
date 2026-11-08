#!/usr/bin/env bash
# H2 dependency and local build bootstrap, no deployment and no database access.
# Run only from a developer-owned checkout with working npm registry access.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
expected="feature/dayframe-m53-release-20261107"
actual="$(git branch --show-current)"
if [[ "$actual" != "$expected" ]]; then
  echo "Refusing to change the dependency lock on branch '$actual' (expected '$expected')." >&2
  exit 4
fi
node -e 'if(+process.versions.node.split(".")[0]<24) { console.error("Node.js 24+ required");process.exit(2) }'
echo "H2: Dayframe dependency and build verification — feature branch only."
echo "No GitHub Actions, Cloud Shell, Neon, production services, merges, or deploys."
if [[ ! -f package-lock.json ]]; then
  echo "Resolving and writing genuine npm dependency metadata (no lifecycle scripts)..."
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund
fi
if [[ ! -s package-lock.json ]]; then
  echo "Failed: npm lockfile is missing or empty." >&2
  exit 3
fi
node -e '
 const p=require("./package.json"),l=require("./package-lock.json");
 if(l.lockfileVersion<3||l.name!==p.name||!l.packages?.[""])
   throw Error("Invalid generated npm lockfile metadata");
 const root=l.packages[""];
 for(const kind of ["dependencies","devDependencies"])
  for(const [name,range] of Object.entries(p[kind]||{}))
   if(root[kind]?.[name]!==range)throw Error("Lockfile dependency mismatch: "+name);
'
npm ci --no-audit --no-fund
npm run test:source
npm run test:time
npm run test:documents
npm run test:pwa
node --experimental-strip-types --test \
 tests/timeReports.test.mjs tests/timeInsights.test.mjs tests/reportCsv.test.mjs
npm run test:api
npm run build
npm run check:dist
npm audit --omit=dev --audit-level=high
echo "PASS: H2 dependency installation, unit/API tests, build, dist and production audit."
echo "Review the resulting package-lock.json before committing it to the feature branch."
echo "This does NOT verify PostgreSQL, browsers, Safari or production readiness."
