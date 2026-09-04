# Production go-live checklist

## Already automated

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:production-config`
- `npm run verify:production-connectors`
- `npm run verify:backup-restore` — logical local/CI rehearsal, не provider evidence
- API health and readiness checks
- Agreement gate: publication, marketplace visibility, confirmation, checkout, capture and order export
- Supplier onboarding readiness and import diagnostics
- Search/index/catalog quality report
- Operator work queue: `/api/operations/work-queue` aggregates commercial blockers before go-live.
- `npm run verify:security-storage` checks encrypted storage columns, key format/rotation and plaintext-sensitive configuration.

## Requires real credentials or external confirmation

- `SIGNATURE_GATEWAY_URL` and `SIGNATURE_CALLBACK_SECRET` — real EDS provider sandbox and callback verification.
- `PAYMENT_PROVIDER_MODE=external`, `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_TOKEN` — PSP sandbox capture/refund/webhook cycle.
- `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` и независимый
  `METRICS_BEARER_TOKEN` — production observability; alert rules подключены из
  `infra/observability/dentmarket-alert-rules.json` и live synthetic alert
  доставлен по маршруту дежурной команды.
- Real supplier BIN, credentials, warehouse, prices, inventory and legal confirmation.
- Signed 1C Agent and a real 1C database.
- Real МойСклад tenant and API token.
- DNS/TLS, managed PITR + real production snapshot restore drill and alert routing.

The connector preflight exits non-zero while required external values are missing. This is intentional: the marketplace remains fail-closed and cannot publish commercial offers with unverified contracts, prices or stock.
