#!/usr/bin/env bash
# H2.4 trial: examine transitive auth security patches without changing
# package.json/package-lock.json in the Dayframe feature checkout.
# No GitHub writes, cloud/database access, merges or deployment.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
branch='feature/dayframe-m53-release-20261107'
if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "Refusing security trial outside $branch" >&2;exit 4
fi
node -e 'if(+process.versions.node.split(".")[0]<24)throw Error("Node 24+ required")'
if [[ ! -s package-lock.json ]]; then
  echo 'Generate a genuine local package-lock.json with H2 bootstrap first.' >&2;exit 3
fi
trial="$(mktemp -d "$HOME/dayframe-security-trial.XXXXXXXX")"
trap 'echo "Isolated H2 security trial retained at: $trial"' EXIT
echo 'Copying tracked source and local lockfile to an isolated home directory.'
git archive HEAD | tar -x -C "$trial"
cp package-lock.json "$trial/package-lock.json"
cd "$trial"
node --input-type=module <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
const p=JSON.parse(readFileSync('package.json','utf8'));
if(p.overrides&&Object.keys(p.overrides).length)throw Error('Existing overrides need separate review');
p.overrides={
 'better-auth':'1.7.7',
 '@better-auth/drizzle-adapter':'1.7.7',
 '@better-auth/oauth-provider':'1.7.7',
 'zod':'4.6.6'
};
writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
console.log('TRIAL ONLY: Better Auth/Drizzle/OAuth patch 1.7.7; Zod 4.6.6.');
NODE
echo 'Resolving trial lockfile; incompatible dependency constraints stop the trial.'
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --no-audit --no-fund
echo 'Testing source, TypeScript, UI build and authenticated backend mock/API contracts.'
npm run test:source
npm run test:time
npm run test:documents
npm run test:pwa
node --experimental-strip-types --test tests/timeReports.test.mjs tests/timeInsights.test.mjs tests/reportCsv.test.mjs
npm run test:api
npm run build
npm run check:dist
echo 'Checking remaining high/critical production dependency advisories.'
npm audit --omit=dev --audit-level=high
echo 'PASS: Trial dependency build and high/critical audit, pending manual Neon Auth browser integration review.'
echo 'The original Dayframe checkout and its lockfile are unchanged.'
echo 'Do not copy trial manifests into the original checkout without reviewing npm peer warnings and auth behavior.'
