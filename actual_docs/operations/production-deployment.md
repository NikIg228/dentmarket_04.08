# Production deployment and rollback

Authentication and abuse-control checks are defined in
[`production-auth-runbook.md`](production-auth-runbook.md). Complete that
runbook together with this release procedure; a successful image build alone
does not prove production auth or shared rate limiting.

## Release contract

Production is deployed only from an immutable `v*` image tag built by `.github/workflows/release.yml`. Configure GitHub repository variables `PUBLIC_API_URL`, `BUYER_APP_URL`, `SUPPLIER_APP_URL`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, and `APPLE_REDIRECT_URI`. Copy `.env.production.example` to `.env.production` on the host and replace every `CHANGE_ME` value through the secret manager.

The API refuses to start when production would use development auth, localhost CORS, mock payments, local object storage, optional antivirus, unencrypted storage, missing EDS/payment/email endpoints, missing MFA, missing Redis, missing observability exporters, or cleartext HTTP for a secret-bearing provider endpoint. Development and test environments may continue to use explicit localhost HTTP endpoints.

`compose.production.yaml` starts two processes from the same API image: `PROCESS_ROLE=api` serves HTTP and produces queue jobs without cron/consumers; `PROCESS_ROLE=worker` runs cron and BullMQ consumers without an HTTP listener. `PROCESS_ROLE=all` is rejected in production. The worker performs role-aware dependency readiness before announcing startup and exits when its required database, storage, or queue dependency is unavailable.

## First deployment

1. Create managed PostgreSQL with PITR, managed Redis with TLS, an encrypted S3-compatible private bucket, DNS records, EDS gateway credentials, PSP credentials, transactional email credentials, Sentry and OTLP projects.
2. Pre-provision at least two corporate operator users as active members of the `MARKETPLACE_OPERATOR` organization. Their Google/Apple verified emails must match the users. Both must enroll TOTP at `/login`.
3. Validate configuration with `npm run build && npm run verify:production-config && npm run verify:rate-limit-auth` and `docker compose --env-file .env.production -f compose.production.yaml config --quiet`.
4. Take a backup, set `REGISTRY` and immutable `APP_RELEASE`, then run `docker compose --env-file .env.production -f compose.production.yaml pull` and `docker compose --env-file .env.production -f compose.production.yaml up -d`.
5. Check `/api/health`, `/api/health/ready`, social login + MFA, supplier onboarding, two-party EDS callback, search, checkout against PSP sandbox, document download, notification delivery and operator queues.

## Backup and restore drill

Run `DATABASE_URL=... S3_BUCKET=... scripts/backup-production.sh`. A backup is
valid only when `SHA256SUMS` verifies. Quarterly, follow
[`backup-restore-runbook.md`](backup-restore-runbook.md): restore the artifact
into a separately provisioned empty `dentmarket_restore_drill_*` database and
versioned isolated bucket, reconcile migrations/data/objects, start the API and
record timings. `npm run verify:backup-restore` is the repeatable local/CI contract;
managed PITR and a real production snapshot still require provider-level
evidence. Never run a rehearsal restore against the live database or bucket.

## Rollback

Application rollback changes `APP_RELEASE` to the previous immutable tag and runs `compose pull/up` again. Database migrations must be backward-compatible expand/contract changes; application rollback does not reverse migrations. If a destructive data incident occurred, close traffic, preserve the affected database, restore the last verified backup into a new database, run smoke verification, then switch `DATABASE_URL` and reopen traffic.

## External go-live blockers

The repository cannot manufacture third-party acceptance. Production remains blocked until real tenant evidence exists for MySklad, a signed 1C agent build and customer database, qualified Kazakhstan EDS, the selected PSP, transactional email/SMS, DNS/TLS, managed PostgreSQL/Redis/S3, monitoring alerts and a timed restore drill. Connector status stays `CONNECTOR_NEEDED` or `PILOT` until evidence is attached; it must never be marked `LIVE_VERIFIED` from mocks.

Run `NODE_ENV=production CHECK_EXTERNAL_CONNECTORS=1 scripts/verify-production-connectors.mjs` after injecting production environment variables. The command never prints secret values and exits non-zero when EDS/PSP/telemetry credentials are missing or their `/health` endpoints are not reachable.
