# Эксплуатация

Все operations/integration runbooks применяются только к явно выбранной задаче
и среде. Их команды — не default checklist каждой разработки. Preflight,
finite timeouts, reuse и лимиты попыток задаёт
[Development Workflow](../governance/DEVELOPMENT_WORKFLOW.md) §4.1–4.4.
Release/restore/live actions требуют своего разрешения. Нельзя автоматически
поднимать новый сервис/кластер, копировать рабочую БД или ослаблять guards после
сбоя теста. Это правило ограничивает действия исполнителя, а не штатные
backoff/replay/recovery доменной системы, описанные ниже.

Нагрузочный профиль controlled pilot, фиксированные SLO и multi-instance Redis
correctness gate описаны в [`b4-6-load-profile.md`](b4-6-load-profile.md).
Runtime-состав `pilot`/`go_live` и fail-safe default описаны в
[`deployment-profiles.md`](deployment-profiles.md).
Production readiness PSP/ЭЦП/supplier/email/SMS/infrastructure описан в
[`live-provider-readiness.md`](live-provider-readiness.md).

## Компоненты

PostgreSQL остаётся source of truth. Redis/BullMQ выполняет фоновые задания; доменные integration jobs, notification attempts и outbox сохраняются в PostgreSQL, поэтому потеря Redis не приводит к потере бизнес-события. MinIO/S3 хранит исходные и сгенерированные файлы. ClamAV проверяет uploads. OTel Collector принимает OTLP traces.

## Health и диагностика

### Локальные auth-письма и операторский вход (AUD-FIX-03.3)

Это отдельный opt-in режим development/test, не email/SMS-интеграция и не
production-способ входа. `AUTH_LOCAL_MAIL_ENABLED=true` сохраняет verification,
password-reset и registration-resume письма как JSON в `.tmp/auth-mail`
**относительно рабочей папки процесса API**. При штатном npm workspace запуске
это `apps/api/.tmp/auth-mail`; audit fixture использует свою уникальную cwd.
Режим не относится ко всем Notifications и не обещает доставку внешних сообщений.

- По умолчанию флаг выключен. API должен слушать `127.0.0.1`, `::1` или
  `localhost`; production/non-loopback с флагом завершается config error.
- JSON содержит получателя, тему, текст и одноразовую ссылку; в нём явно
  `delivery=LOCAL_FILE`, `externalDelivery=false`. Открывать его локальным
  редактором, затем ссылку в браузере. Нет HTTP inbox/token API. В лог/чат/Git
  содержимое и ссылки не копировать. Удаление файла не отзывает уже выданный token.
- На POSIX файлы создаются600/папка700; Windows требует подходящих ACL ОС.
  Только synthetic аккаунты на закрытом тестовом стенде, не реальные пользователи
  общего ПК. Каталог gitignored, не размещать внутри object storage/public и не
  публиковать через reverse proxy. Хранение писем не зашифровано.
- Без local mode или настроенного provider запрос возвращает503; console
  fallback отсутствует. Forgot сохраняет одинаковый ответ для известного и
  неизвестного email. Ошибка передачи не означает «письмо доставлено».
- `GET /api/auth/client-options` отдаёт только режим доставки и доступность
  локальной парольной формы; никакие адреса файлов или ссылки не возвращаются.

`LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED=true` — отдельный флаг: требует
`AUTH_MODE=jwt`, `JWT_REQUIRE_MFA=true`, non-production и loopback API.
Оператор заранее имеет verified email/password, active user и membership в
active организации с `MARKETPLACE_OPERATOR`; для входа в кабинет требуется
роль с `organization.view`. Публичная регистрация таких прав не выдаёт.
Admin login: пароль → настройка TOTP или challenge → elevated token → проверка
существующим защищённым `GET /organizations` → кабинет. На staging/production
этот локальный способ запрещён; принятую social-auth процедуру он не заменяет.

**Не включать эти параметры автоматически в уже работающем основном API.**
JWT_REQUIRE_MFA применяется ко всем защищённым маршрутам и всем ролям API;
локальную проверку оператора проводят отдельным стендом. Для проверки только
почты operator flag не нужен. Стабильные JWT/encryption keys стенда задаются
в его private environment: смена APP_SECURITY_ENCRYPTION_KEY ломает расшифровку
уже сохранённого MFA. Audit harness выдаёт случайные ключи и новые synthetic
аккаунты на каждый запуск и не предназначен для постоянных пользовательских аккаунтов.

Проверка по явному разрешению на записи: `node scripts/verify-local-auth.mjs`
с `POSTGRES_TEST_DATABASE_URL`, указывающим только на согласованную
`dentmarket_audit_20260914` на127.0.0.1:5432; до неё собраны schemas и API.
Не подставлять рабочую DB. Скрипт проверяет database identity, отключает
очереди/внешние adapters, создаёт собственные пользователи/организации,
использует реально сохранённые письма. После остановки отзывает свои сессии,
удаляет только свои JSON-письма, оставляет synthetic DB records для readback.
Создание кластера/прав/клонирование/reseed основной DB в эту процедуру не входят.

### Общие endpoints

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
