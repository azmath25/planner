#!/usr/bin/env bash
# Dayframe H4: disposable PostgreSQL 18 database regression gate.
# Starts a uniquely named local Docker container and removes it on exit.
# No Neon connection or production database access.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
branch='feature/dayframe-m53-release-20261107'
if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "Refusing to run outside $branch" >&2;exit 4
fi
node -e 'if(+process.versions.node.split(".")[0]<24)throw Error("Node 24+ required")'
if [[ ! -s package-lock.json ]]; then
  echo 'Missing verified package-lock.json' >&2;exit 3
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'BLOCKED: local Docker daemon is unavailable. No database was touched.' >&2
  exit 3
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 needed for port-availability check' >&2;exit 3
fi

# Never attach to arbitrary local PostgreSQL or a remote Neon database.
# The test suite enforces the same exact disposable URL.
if ! python3 - <<'PY'
import socket,sys
s=socket.socket()
try:
    s.bind(('127.0.0.1',5432))
except OSError:
    print('BLOCKED: localhost:5432 already occupied; refusing to use it.',file=sys.stderr)
    sys.exit(3)
finally:
    s.close()
PY
then exit 3;fi
export PG_AUDIT_URL='postgres://audit:auditpass@127.0.0.1:5432/dayframe_audit'
unset DATABASE_URL
image='postgres:18-alpine'
name="dayframe-h4-audit-$$"
container_created=false
cleanup(){
  local code=$?
  trap - EXIT
  if [[ "$container_created" == true ]];then
    if [[ "$code" -ne 0 ]];then
      echo 'Disposable PostgreSQL logs (limited tail):' >&2
      docker logs --tail 70 "$name" >&2 || true
    fi
    docker rm -f "$name" >/dev/null 2>&1 || {
      echo "WARNING: unable to remove temporary container $name" >&2
    }
  fi
  echo 'No Neon or other project database was modified.'
  exit "$code"
}
trap cleanup EXIT

echo 'Checking local disk space before downloading PostgreSQL image.'
avail_kb=$(df -Pk . | awk 'NR==2{print $4}')
if [[ "$avail_kb" -lt 500000 ]]; then
  echo 'BLOCKED: insufficient free disk (require 500 MB); no image downloaded.' >&2;exit 3
fi

# Pull is intentionally explicit and limited to the known public PostgreSQL image.
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "Pulling disposable test database image $image"
  docker pull "$image"
fi
echo 'Starting isolated PostgreSQL 18 on loopback only.'
docker run -d --rm --name "$name" \
  -e POSTGRES_USER=audit \
  -e POSTGRES_PASSWORD=auditpass \
  -e POSTGRES_DB=dayframe_audit \
  -p 127.0.0.1:5432:5432 \
  "$image" >/dev/null
container_created=true

ready=false
for attempt in $(seq 1 45); do
  if docker exec "$name" pg_isready -U audit -d dayframe_audit >/dev/null 2>&1;then
    ready=true;break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'Local PostgreSQL never became ready' >&2;exit 3
fi
echo 'Running actual migration scripts 0001–0020 and SQL regressions on disposable PostgreSQL 18.'
node --test tests/deep-postgres-regression.mjs
echo 'PASS: Dayframe H4 local PostgreSQL 18 migrations and regressions.'
echo 'The disposable test database/container will now be deleted.'
