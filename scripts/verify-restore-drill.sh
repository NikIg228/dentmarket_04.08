#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/path/to/backup-directory" >&2; exit 2; fi
BACKUP_DIR="$1"
[[ -f "${BACKUP_DIR}/database.dump" && -f "${BACKUP_DIR}/manifest.txt" && -f "${BACKUP_DIR}/SHA256SUMS" ]] || { echo "Backup is incomplete" >&2; exit 2; }
(cd "${BACKUP_DIR}" && shasum -a 256 --check SHA256SUMS)
pg_restore --list "${BACKUP_DIR}/database.dump" >/dev/null

if [[ -z "${RESTORE_DRILL_DATABASE_URL:-}" ]]; then
  echo "DRY_RUN: checksum and pg_restore manifest verified; set RESTORE_DRILL_DATABASE_URL for an isolated restore"
  exit 0
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is required to prove that source and target differ" >&2; exit 2; }
TARGET_DATABASE="$(node -e '
  const source = new URL(process.env.DATABASE_URL);
  const target = new URL(process.env.RESTORE_DRILL_DATABASE_URL);
  const database = (url) => decodeURIComponent(url.pathname.replace(/^\//, ""));
  const identity = (url) => `${url.hostname.toLowerCase()}:${url.port || "5432"}/${database(url)}`;
  if (identity(source) === identity(target)) throw new Error("restore target is the source database");
  const targetDatabase = database(target);
  if (!/^dentmarket_restore_drill_[a-z0-9_]+$/.test(targetDatabase)) throw new Error("unsafe restore target name");
  process.stdout.write(targetDatabase);
')"
RESTORE_TOOL_DATABASE_URL="$(node -e '
  const target = new URL(process.env.RESTORE_DRILL_DATABASE_URL);
  for (const parameter of ["schema", "connection_limit", "pool_timeout", "pgbouncer"]) target.searchParams.delete(parameter);
  process.stdout.write(target.toString());
')"
[[ "${RESTORE_DRILL_CONFIRM:-}" == "${TARGET_DATABASE}" ]] || { echo "Set RESTORE_DRILL_CONFIRM=${TARGET_DATABASE} for this isolated target" >&2; exit 2; }
TARGET_TABLES="$(psql "${RESTORE_TOOL_DATABASE_URL}" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';")"
[[ "${TARGET_TABLES}" == "0" ]] || { echo "Restore target must be a newly created empty database; found ${TARGET_TABLES} public tables" >&2; exit 2; }
pg_restore --dbname "${RESTORE_TOOL_DATABASE_URL}" --no-owner --no-acl --exit-on-error "${BACKUP_DIR}/database.dump"
RESTORED_MIGRATIONS="$(psql "${RESTORE_TOOL_DATABASE_URL}" --set ON_ERROR_STOP=1 --tuples-only --no-align --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"
EXPECTED_MIGRATIONS="$(sed -n 's/^schema_migrations=//p' "${BACKUP_DIR}/manifest.txt" | tr -d '[:space:]')"
[[ -n "${EXPECTED_MIGRATIONS}" && "${RESTORED_MIGRATIONS}" == "${EXPECTED_MIGRATIONS}" ]] || { echo "Migration reconciliation failed: expected ${EXPECTED_MIGRATIONS:-missing}, restored ${RESTORED_MIGRATIONS}" >&2; exit 2; }
echo "RESTORE_DRILL_OK: isolated database restored and migration table is readable"
