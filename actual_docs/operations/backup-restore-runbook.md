# Backup/restore runbook

## 1. Назначение и статус доказательства

PostgreSQL остаётся source of truth, а object storage содержит исходные и
сгенерированные файлы. B4.2 доказывает локальный и CI-сценарий логического
восстановления на уровне `INTEGRATION_VERIFIED`:

1. снять консистентный custom-format dump;
2. создать manifest и SHA-256 checksums;
3. восстановить только в новую изолированную БД;
4. сверить данные, sequences, migrations и objects;
5. запустить API на restored DB и проверить health/readiness;
6. удалить только созданную drill-базу после проверки ownership marker.

Этот gate не подменяет provider-level evidence: managed WAL/PITR, S3
versioning, retention и восстановление реального production snapshot получают
`LIVE_VERIFIED` только после отдельного timed drill в deployment-контуре.

## 2. Safety invariants

- Restore target никогда не совпадает с source по `host:port/database`.
- Target автоматически получает имя `dentmarket_restore_drill_*` и должен
  отсутствовать до запуска.
- Удаляется только target, созданный текущим процессом и имеющий ожидаемый
  database comment marker.
- Remote source или target требуют одновременно
  `BACKUP_RESTORE_ALLOW_REMOTE=true` и
  `BACKUP_RESTORE_CONFIRM=I_UNDERSTAND_REMOTE_RESTORE_DRILL`.
- Remote target на том же сервере, что source, по умолчанию запрещён; для
  осознанного исключения нужен `BACKUP_RESTORE_ALLOW_SAME_SERVER=true`.
- Source snapshot сравнивается до и после `pg_dump`. Любая запись во время
  dump делает gate красным: для drill нужен quiesced staging/replica.
- Прикладной role не получает `CREATEDB`. Для target используется отдельный
  ограниченный admin connection через `RESTORE_DRILL_ADMIN_DATABASE_URL`.
- Секреты и полные database URLs не записываются в manifest или evidence.

## 3. Локальный запуск

На текущем Windows-окружении PostgreSQL 17 client найден автоматически в
`C:\Program Files\PostgreSQL\17\bin`. Укажите admin connection через локальный
secret store, не коммитьте его в `.env`:

```powershell
$env:RESTORE_DRILL_ADMIN_DATABASE_URL="postgresql://ADMIN_USER:ADMIN_PASSWORD@127.0.0.1:5432/postgres"
$env:RESTORE_DRILL_USE_OBJECT_FIXTURE="true"
npm run verify:backup-restore
Remove-Item Env:RESTORE_DRILL_ADMIN_DATABASE_URL
Remove-Item Env:RESTORE_DRILL_USE_OBJECT_FIXTURE
```

`RESTORE_DRILL_USE_OBJECT_FIXTURE=true` применяется только в automation для
детерминированной проверки двух object files. Для проверки реального локального
storage уберите переменную и при необходимости задайте
`BACKUP_RESTORE_OBJECT_SOURCE` или `LOCAL_STORAGE_PATH`.

Gate принимает native PostgreSQL client по умолчанию. В Linux CI используется:

```bash
POSTGRES_CLIENT_MODE=docker \
RESTORE_DRILL_USE_OBJECT_FIXTURE=true \
npm run verify:backup-restore
```

Docker mode запускает client из `postgres:17-alpine`; database service остаётся
отдельным ephemeral PostgreSQL 17 job.

## 4. Что именно сверяется

- `pg_dump --format custom --no-owner --no-acl` создаёт непустой artifact;
- `pg_restore --list` читает manifest dump до изменения target;
- SHA-256 покрывает dump, backup manifest и каждый object;
- все public tables и sequences сравниваются между source и restored DB;
- каждая таблица дополнительно имеет content hash при размере до
  `RESTORE_DRILL_DEEP_HASH_MAX_ROWS`; крупные таблицы сохраняют row-count
  reconciliation и целостность dump SHA-256;
- `prisma migrate status` обязан подтвердить отсутствие pending migrations;
- restored API обязан отдать успешные `/api/health` и `/api/health/ready`;
- object inventory обязан совпасть по relative path, bytes и SHA-256;
- финальный SQL pre-check обязан показать 0 оставшихся
  `dentmarket_restore_drill_*` databases.

## 5. Зафиксированный B4.2 rehearsal

Финальный локальный запуск 2026-08-19 дал:

- status: `BACKUP_RESTORE_DRILL_OK`;
- PostgreSQL 17, 31 migration, 149 public tables;
- 149 content hashes;
- 2 synthetic object files;
- backup: 0,887 с;
- restore: 5,362 с;
- validation: 13,003 с;
- полный цикл: 23,364 с;
- source unchanged: true;
- оставшиеся drill databases: 0.

Это существенно ниже целевого RTO 4 часа, но объём pilot-базы мал. Результат не
снижает целевой RPO 15 минут и не доказывает PITR.

## 6. Production backup artifact

Production full backup создаётся отдельно:

```bash
DATABASE_URL=... S3_BUCKET=... scripts/backup-production.sh
```

До restore artifact проверяется без изменения БД:

```bash
scripts/verify-restore-drill.sh /absolute/path/to/backup
```

Для восстановления уже созданного artifact оператор заранее создаёт новую
пустую БД с безопасным именем, например
`dentmarket_restore_drill_2026q3`, и задаёт source, target и точное
подтверждение:

```bash
DATABASE_URL=... \
RESTORE_DRILL_DATABASE_URL=.../dentmarket_restore_drill_2026q3 \
RESTORE_DRILL_CONFIRM=dentmarket_restore_drill_2026q3 \
scripts/verify-restore-drill.sh /absolute/path/to/backup
```

Legacy verifier больше не выполняет `DROP SCHEMA public`: непустой target,
совпадение source/target, неверный prefix или confirmation завершают процедуру
до restore. После restore migration count обязан совпасть с `manifest.txt`.

Object backup разворачивается только в отдельный versioned bucket. Его inventory
и checksum сверяются до переключения приложения. Нельзя зеркалировать drill в
live bucket.

## 7. Provider-level go-live evidence

Перед go-live владелец инфраструктуры сохраняет в incident/change record:

- immutable backup ID и timestamp;
- PITR restore point и фактический measured RPO;
- отдельные database и bucket identifiers без credentials;
- checksum result и число восстановленных objects;
- migration status, API readiness и read-only business reconciliation;
- фактические backup/restore/validation/total durations;
- подтверждение, что source не изменялся и drill target удалён либо изолирован;
- owner, дата следующего quarterly drill и remediation для всех отклонений.

Пока этого evidence нет, production backup/restore остаётся не
`LIVE_VERIFIED`, даже если локальный B4.2 gate зелёный.
