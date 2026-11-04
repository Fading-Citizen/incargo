#!/usr/bin/env bash
# Disposable PostgreSQL only. Argument is a private generated import directory.
set -euo pipefail
cd "$(dirname "$0")/../.."
archive_dir="${1:?Provide private import directory}"
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
local_docker=(docker --host=unix:///var/run/docker.sock)
container="incargo-legacy-import-test-$$"
"${local_docker[@]}" run --rm -d --name "$container" -e POSTGRES_PASSWORD=isolated_test_only postgres:17-alpine >/dev/null
trap '"${local_docker[@]}" rm -f "$container" >/dev/null' EXIT
for attempt in {1..30}; do
 if "${local_docker[@]}" logs "$container" 2>&1 | rg -q 'PostgreSQL init process complete'; then
  if "${local_docker[@]}" exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 fi
 sleep 1
done
for script in incargo-app/tests/policy-bootstrap.sql incargo-app/migration.sql panel/database/migrations/20261103_legacy_operations_versions.sql panel/database/migrations/20261103_legacy_snapshot_parts.sql panel/database/migrations/20261103_legacy_revision_export.sql; do
 "${local_docker[@]}" exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script" >/dev/null
done
for replay in 1 2; do
 for script in "$archive_dir"/*.sql; do
  "${local_docker[@]}" exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$script" >/dev/null
 done
done
"${local_docker[@]}" exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "select kind,count(*) as originals,count(*) filter(where original_raw::jsonb=original_payload and encode(sha256(convert_to(original_raw,'UTF8')),'hex')=hash) as verified from incargo_admin.documents group by kind; select kind,hash,octet_length(raw) as bytes from incargo_admin.source_snapshots; select count(*) as revisions from incargo_admin.revisions;"
echo 'PASS: complete source/row hashes, original payload integrity and duplicate import replay in disposable local PostgreSQL'
