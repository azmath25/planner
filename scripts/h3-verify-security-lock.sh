#!/usr/bin/env bash
# H3.1: regenerate and test the patched Dayframe dependency lockfile.
# No GitHub push/merge, cloud calls, database changes or deployment.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
branch='feature/dayframe-m53-release-20261107'
if [[ "$(git branch --show-current)" != "$branch" ]]; then
 echo "Refusing to run outside $branch" >&2; exit 4
fi
node -e 'if(+process.versions.node.split(".")[0]<24)throw Error("Node 24+ required")'
if [[ -L package-lock.json ]]; then
 echo 'Refusing to overwrite symlinked package-lock.json.' >&2; exit 3
fi
if ! git diff --quiet -- package.json; then
 echo 'Local package.json edits detected; review before continuing.' >&2;exit 3
fi
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const expected={'better-auth':'1.7.7','@better-auth/drizzle-adapter':'1.7.7',
 '@better-auth/oauth-provider':'1.7.7','zod':'4.6.6'};
if(JSON.stringify(pkg.overrides)!==JSON.stringify(expected))
 throw Error('Security overrides differ from the passed H2 trial');
console.log('H3.1: verified same security overrides as passing isolated trial.');
NODE
if [[ -f package-lock.json ]]; then
 backup=$(mktemp "/tmp/dayframe-h3-lock-backup.XXXXXXXX.json")
 cp -p -- package-lock.json "$backup"
 echo "Previous lockfile preserved locally: $backup"
fi
echo 'Regenerating genuine npm dependency lockfile with patched overrides.'
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
if(lock.lockfileVersion<3||lock.name!==pkg.name||!lock.packages?.[''])
 throw Error('Invalid generated npm lockfile');
for(const section of ['dependencies','devDependencies'])
 for(const [name,range] of Object.entries(pkg[section]||{}))
  if(lock.packages[''][section]?.[name]!==range)throw Error('Lockfile root mismatch: '+name);
for(const [name,version] of Object.entries(pkg.overrides)){
 const matches=Object.entries(lock.packages).filter(([key])=>
  key==='node_modules/'+name||key.endsWith('/node_modules/'+name));
 if(!matches.length)throw Error('No lockfile entry for '+name);
 for(const [path,info] of matches)
  if(info.version!==version)throw Error('Unpatched '+path+'@'+info.version);
 console.log('Verified '+name+'@'+version+' ('+matches.length+' location(s))');
}
NODE
log=$(mktemp "$HOME/dayframe-h3-verify.XXXXXXXX.log")
echo "Running complete H2 verification; full log: $log"
if bash scripts/h2-bootstrap-local.sh > "$log" 2>&1; then
 tail -n 45 "$log"
 echo 'PASS H3.1: patched lockfile, tests, TypeScript, build, dist, and high/critical audit.'
 echo 'UNVERIFIED: real Neon Auth browser sign-in, PostgreSQL migrations, mobile and Safari.'
 echo 'Review and commit package-lock.json only on this feature branch.'
else
 result=$?
 echo "H3.1 FAILED (exit $result). Relevant log tail:" >&2
 tail -n 120 "$log" >&2
 exit "$result"
fi
