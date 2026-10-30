#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
local_docker=(docker --host=unix:///var/run/docker.sock)
container=incargo-enterprise-test
if "${local_docker[@]}" inspect "$container" >/dev/null 2>&1; then
  echo "Refusing to replace existing local test container: $container" >&2; exit 1
fi
"${local_docker[@]}" run --rm -d --name "$container" -e POSTGRES_PASSWORD=isolated_test_only postgres:17-alpine >/dev/null
trap '"${local_docker[@]}" rm -f "$container" >/dev/null' EXIT
for attempt in {1..30}; do
 if "${local_docker[@]}" logs "$container" 2>&1 | rg -q "PostgreSQL init process complete"; then
  if "${local_docker[@]}" exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 fi
 sleep 1
done
for script in incargo-app/tests/policy-bootstrap.sql incargo-app/migration.sql incargo-app/migration_permissions_fix.sql incargo-app/migration_hardening.sql incargo-app/client-portal.proposal.sql panel/database/enterprise-model.proposal.sql panel/database/enterprise-read.proposal.sql panel/database/enterprise-local.test.sql panel/database/enterprise-activation.proposal.sql panel/database/enterprise-receipts.proposal.sql; do
 "${local_docker[@]}" exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script" >/dev/null
done
python3 panel/database/concurrency.test.py
node panel/tests/business-browser.cjs
