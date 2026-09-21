# Production go-live checklist

## Очередь выполнения — 2026-09-14

Этот runbook остаётся действующим, но сейчас не исполняется: владелец выбрал
завершение локального backend core без новых внешних интеграций.
Приёмка окружения/данных/release — POST-BE после CORE-09; финальная web-приёмка
требует также завершённого frontend и POST-FULL. Provider/legal проверки — EXT
по отдельному разрешению. См. [Foundation](../backend/DENTMARKET_BACKEND_FOUNDATION_V2.md).

Отложенное не закрыто и не отменено. Локальный demo/manual результат не является
production payment/signature/delivery evidence. Все обязательные safety guards
и проверки каждой изменяемой фазы сохраняются. Перечень провайдеров ниже —
условия соответствующих включаемых интеграций, не требование подключить
одновременно 1С, МойСклад и всех перевозчиков для завершения core.

## Already automated

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify:production-config`
- `npm run verify:production-connectors`
- `npm run verify:production-readiness-contract`
- `npm run verify:live-evidence` — только с внешним evidence manifest; template
  намеренно не проходит gate
- `npm run verify:backup-restore` — logical local/CI rehearsal, не provider evidence
- API health and readiness checks
- Agreement gate: publication, marketplace visibility, confirmation, checkout, capture and order export
- Supplier onboarding readiness and import diagnostics
- Search/index/catalog quality report
- Operator work queue: `/api/operations/work-queue` aggregates commercial blockers before go-live.
- `npm run verify:security-storage` checks encrypted storage columns, key format/rotation and plaintext-sensitive configuration.

Полная последовательность configuration → reachability → semantic evidence
описана в [`live-provider-readiness.md`](live-provider-readiness.md).

## Requires real credentials or external confirmation

- `SIGNATURE_GATEWAY_URL` and `SIGNATURE_CALLBACK_SECRET` — real EDS provider sandbox and callback verification.
- `SIGNATURE_GATEWAY_TOKEN` и отдельный безопасный health endpoint провайдера.
- `PAYMENT_PROVIDER_MODE=external`, `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_TOKEN` — PSP sandbox capture/refund/webhook cycle.
- `PAYMENT_WEBHOOK_SECRET_EXTERNAL` и отдельный безопасный health endpoint PSP.
- HTTPS endpoints/tokens и provider receipts для email и SMS.
- `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` и независимый
  `METRICS_BEARER_TOKEN` — production observability; alert rules подключены из
  `infra/observability/dentmarket-alert-rules.json` и live synthetic alert
  доставлен по маршруту дежурной команды.
- Real supplier BIN, credentials, warehouse, prices, inventory and legal confirmation.
- Signed 1C Agent and a real 1C database.
- Real МойСклад tenant and API token.
- DNS/TLS, managed PITR + real production snapshot restore drill and alert routing.

The connector preflight exits non-zero while required external values are missing. This is intentional: the marketplace remains fail-closed and cannot publish commercial offers with unverified contracts, prices or stock.
