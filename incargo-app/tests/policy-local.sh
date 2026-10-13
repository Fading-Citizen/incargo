#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_container="incargo-policy-$$"
cleanup() { docker rm -f "$test_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --rm -d --name "$test_container" -e POSTGRES_PASSWORD=local_test_only postgres:17-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for script in tests/policy-bootstrap.sql migration.sql migration_permissions_fix.sql migration_hardening.sql migration_anon_revoke.sql tests/policy-assert.sql; do
  docker exec -i "$test_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script" >/dev/null
done
echo 'Isolated Postgres policy tests passed.'
