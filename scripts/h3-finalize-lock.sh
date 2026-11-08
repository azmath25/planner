#!/usr/bin/env bash
# H3: publish the already-tested, genuine lockfile on the existing feature branch.
# Never changes main, runs deployments, or touches Neon/GCP.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
branch='feature/dayframe-m53-release-20261107'
test "$(git branch --show-current)" = "$branch" || { echo "Wrong branch" >&2;exit 4; }
test -s package-lock.json || { echo "Missing genuine local package-lock.json" >&2;exit 3; }
git diff --quiet || { echo 'Local tracked changes must be reviewed first.' >&2;exit 3; }
staged=$(git diff --cached --name-only)
if [[ -n "$staged" && "$staged" != package-lock.json ]]; then
 echo 'Unrelated staged changes detected; refusing to commit.' >&2;exit 3
fi
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
if(lock.lockfileVersion<3||lock.name!==pkg.name||!lock.packages?.[''])throw Error('Invalid lockfile');
for(const sec of ['dependencies','devDependencies']){
 for(const [name,version] of Object.entries(pkg[sec]??{}))
  if(lock.packages[''][sec]?.[name]!==version)throw Error('Root mismatch: '+name);
}
for(const [name,version] of Object.entries(pkg.overrides??{})){
 const matches=Object.entries(lock.packages).filter(([key])=>
  key==='node_modules/'+name||key.endsWith('/node_modules/'+name));
 if(!matches.length||matches.some(([,record])=>record.version!==version))
  throw Error('Unverified patched dependency: '+name);
}
console.log('PASS: genuine lockfile root metadata and all override entries match.');
NODE
git fetch origin "$branch"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]]; then
 echo "Local feature branch is not the latest origin/$branch; review and fast-forward first" >&2; exit 3
fi
if [[ -L package-lock.json ]]; then echo 'Refusing symlinked lockfile' >&2;exit 3;fi
git add -- package-lock.json
if [[ "$(git diff --cached --name-only)" != package-lock.json ]]; then
 echo 'Refusing unexpected staged files' >&2;exit 3
fi
git diff --cached --check
# GitHub account identity resolved through the connected account: azmath25.
# Set author ONLY for this commit; never change global or repository settings.
git -c user.name='azmath25' -c user.email='234483322+azmath25@users.noreply.github.com' \
 commit -m "build(dayframe): lock verified H3 patched dependencies"
git push origin "HEAD:refs/heads/$branch"
echo "PASS: genuine lockfile published to $branch (not main)."
echo 'No merge, database mutation or deployment occurred.'
