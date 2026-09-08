# B4.6: нагрузочный профиль catalog и checkout

## Назначение

Этот gate проверяет controlled-pilot dataset на отдельной PostgreSQL базе и не
изменяет рабочую локальную базу. Он измеряет authenticated search/compare,
cart validation/reprice/checkout, повторный idempotency key, конкурентный
scarce stock и горячие SQL plans. Отдельный gate поднимает два API-процесса с
общим ephemeral Redis-compatible runtime и доказывает общий rate-limit state.

Локальные gates не заменяют managed-infrastructure failover и длительный
staging soak. Test Redis runtime запрещено использовать как production Redis.

## Предусловия

- Node.js и зависимости установлены через `npm ci` или `npm install`;
- PostgreSQL 17 доступен локально;
- application role из `DATABASE_URL` имеет доступ к исходной test-базе;
- отдельная admin role может создать и удалить только временную БД;
- `apps/buyer-web/app/data/public-catalog-fallback.json` содержит pilot catalog
  из 500 карточек.

Не помещайте admin URL в git, `.env.example`, логи или evidence. В PowerShell
передавайте его только через process environment:

```powershell
$env:B46_ADMIN_DATABASE_URL="postgresql://ADMIN_USER:ADMIN_PASSWORD@127.0.0.1:5432/postgres"
npm run verify:load-profile
Remove-Item Env:B46_ADMIN_DATABASE_URL
```

Runner принимает `POSTGRES_TEST_DATABASE_URL` или `DATABASE_URL` как источник
application role, создаёт БД с префиксом `dentmarket_b46_`, назначает её
владельцем application role, применяет 32 migrations, загружает reference /
operator / 500-card catalog / pilot market и удаляет БД в `finally`. Remote
PostgreSQL запрещён по умолчанию; явный `B46_ALLOW_REMOTE=true` допустим только
для заранее выделенного disposable load environment.

## Канонический single-instance профиль

Параметры по умолчанию:

| Контур               |                 Объём | Concurrency | Порог                                            |
| -------------------- | --------------------: | ----------: | ------------------------------------------------ |
| Search/compare burst |          300 requests |          20 | search p95 <= 750 ms; compare p95 <= 1000 ms     |
| Cart-to-checkout     |              20 flows |           4 | flow p95 <= 5000 ms                              |
| Search/compare soak  |            60 seconds |          10 | общий p95 <= 1000 ms                             |
| Все операции         |           весь прогон |           — | error rate = 0                                   |
| PostgreSQL           |     весь HTTP профиль |           — | API connections <= 30                            |
| Hot SQL plans        | catalog + reservation |           — | execution <= 100 ms; shared reads <= 1000 blocks |

Write-flow выбирает только 400 офферов с доступным остатком; все 500 офферов,
включая 100 намеренно недоступных, остаются в read/compare. Каждый flow делает
`cart create -> add -> validate -> reprice -> two concurrent checkout requests`
с одним idempotency key. Scarce-stock case создаёт два заказа по четыре единицы
при остатке пять и требует ровно `201/409`, финальный available/reserved `1/4`.

Переменные `B46_READ_REQUESTS`, `B46_READ_CONCURRENCY`, `B46_WRITE_FLOWS`,
`B46_WRITE_CONCURRENCY`, `B46_SOAK_SECONDS`, `B46_SOAK_CONCURRENCY` разрешены
только для локальной диагностики. Уменьшенный профиль не является evidence для
закрытия B4.6.

Raw JSON сохраняется в `.tmp/b4-6/`. Путь можно переопределить через
`B46_EVIDENCE_PATH`; секреты в отчёт не записываются.

## Multi-instance Redis correctness gate

```powershell
npm run verify:load-multi-instance
```

Gate поднимает два API на свободных loopback ports и один isolated
Redis-compatible process через pinned npm dev dependency. Оба readiness ответа
должны подтвердить shared queue producer. После `FLUSHALL` двенадцать запросов
подаются попеременно в два инстанса; тринадцатый обязан получить HTTP 429.
Процессы API и Redis останавливаются в `finally`, raw JSON сохраняется в
`.tmp/b4-6/*_multi_instance.json`.

## Stop criteria

Работа останавливается и B4.6 не получает `[x]`, если:

- любая migration, seed или cleanup операция не прошла;
- временная БД осталась после прогона;
- error rate выше нуля или любой latency/saturation/SQL threshold превышен;
- idempotency вернула разные checkout IDs;
- scarce-stock не дал `201/409` и `1/4`;
- два API не используют один Redis state;
- отсутствуют raw results, runtime/hardware metadata или точный commit;
- managed Redis failover и длительный staging soak ещё не выполнены для
  production readiness.

## Evidence

Канонические результаты и commit фиксируются в backend audit только после
повторного зелёного запуска на committed revision. Локальная Windows-машина и
ephemeral Redis доказывают regression/correctness baseline; staging evidence
добавляется отдельной датированной записью без перезаписи local results.
