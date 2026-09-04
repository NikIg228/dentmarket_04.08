# Эксплуатация

## Компоненты

PostgreSQL остаётся source of truth. Redis/BullMQ выполняет фоновые задания; доменные integration jobs, notification attempts и outbox сохраняются в PostgreSQL, поэтому потеря Redis не приводит к потере бизнес-события. MinIO/S3 хранит исходные и сгенерированные файлы. ClamAV проверяет uploads. OTel Collector принимает OTLP traces.

## Health и диагностика

- API liveness: `GET /api/health`.
- API readiness: `GET /api/health/ready` проверяет PostgreSQL, обязательную очередь и object storage; только этот endpoint следует использовать для снятия pod из traffic.
- Все ответы содержат `x-request-id`; логи включают correlation ID, trace ID, actor и organization.
- BullMQ только будит обработчики. `OutboxEvent` хранит durable lifecycle в
  PostgreSQL: retryable-ошибка получает exponential backoff, постоянная ошибка
  или исчерпание `maxAttempts` переводит событие в `DEAD_LETTER`, а
  просроченный `PROCESSING` lease может быть безопасно reclaimed.
- Sentry включается только при наличии `SENTRY_DSN`.

Scheduler `MarketplaceAgreementsService.processRenewals` ежедневно закрывает истёкшие договоры либо переносит активный AUTO_ANNUAL договор на следующий год. После длительного простоя он догоняет все пропущенные годовые периоды за один idempotent transaction. Новая версия обязательного шаблона переводит договор в `SUPERSEDED` и требует повторной ЭЦП.

## Backup policy

Рекомендуемая базовая политика:

- PostgreSQL full dump ежедневно, WAL/PITR в production;
- S3 versioning и cross-region/lifecycle policy;
- retention: 7 daily, 4 weekly, 12 monthly;
- целевые RPO 15 минут и RTO 4 часа для первой production-конфигурации;
- restore drill не реже раза в квартал.

Автоматический локальный/CI rehearsal описан в
[`backup-restore-runbook.md`](backup-restore-runbook.md). Он создаёт отдельную
drill-базу, сверяет data/object checksums, migrations и API readiness и затем
безопасно удаляет target:

```powershell
$env:RESTORE_DRILL_ADMIN_DATABASE_URL="postgresql://ADMIN_USER:ADMIN_PASSWORD@127.0.0.1:5432/postgres"
$env:RESTORE_DRILL_USE_OBJECT_FIXTURE="true"
npm run verify:backup-restore
```

Docker-based локальный backup для maintenance-контура:

```bash
./scripts/backup.sh
```

Restore полностью заменяет schema `public`, поэтому выполняется только в остановленном maintenance-контуре:

```bash
docker compose stop api admin-web buyer-web supplier-web landing-web seed
RESTORE_CONFIRM=<backup-directory-name> ./scripts/restore.sh /absolute/path/to/backup
docker compose up -d api admin-web buyer-web supplier-web landing-web
```

После восстановления обязательны `prisma migrate status`, health, search rebuild и read-only сверка ledger/document checksums.

Production backup/restore, immutable release and rollback описаны в
[`production-deployment.md`](production-deployment.md). Recovery scripts
работают напрямую с `DATABASE_URL` и проверяют SHA-256. Rehearsal выполняется
только в новой пустой БД с prefix `dentmarket_restore_drill_*`; production
recovery с заменой schema остаётся отдельной maintenance-процедурой.

## Incident flow

1. Зафиксировать request/correlation/trace ID и affected aggregate IDs.
2. Остановить повторные side effects через provider/feature operational switch.
3. Проверить outbox, integration jobs, notification attempts и reconciliation.
4. Не изменять ledger и signed documents вручную; использовать compensating operation/version.
5. После устранения выполнить targeted retry и записать incident decision в audit/operations log.

Операторский replay `OutboxEvent.DEAD_LETTER` выполняется только через
защищённые операции `GET /api/operations/outbox/dead-letter` и
`POST /api/operations/outbox/dead-letter/{eventId}/replay`. Доступ требуют
permissions `operations.outbox.view`/`operations.outbox.replay` и capability
`MARKETPLACE_OPERATOR`; причина и idempotency key обязательны. Payload нельзя
редактировать, replay атомарно возвращает событие в `PENDING`, сбрасывает
attempts и lease, а audit trail фиксирует actor, tenant, причину и старое
состояние. Повтор того же ключа безопасен, reuse для другого события
отклоняется. При диагностике фиксируются event ID, `eventType`, `attempts`,
`lastError`, `lockedBy` и связанный aggregate.
