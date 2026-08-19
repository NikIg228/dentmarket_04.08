# B4.1: metrics, alerts и первичная диагностика

## Контракт сбора

- API публикует Prometheus text exposition на `GET /api/metrics`.
- Scrape обязан передавать отдельный `Authorization: Bearer <METRICS_BEARER_TOKEN>`.
  Пользовательский JWT и tenant headers не являются credentials для мониторинга.
- В production `METRICS_BEARER_TOKEN` обязателен и хранится отдельно от JWT,
  webhook и integration secrets.
- HTTP labels ограничены `method`, Express route template и `status_code`.
  Tenant, user, UUID, query и произвольный URL в labels не попадают.
- Outbox, checkout и import gauges строятся из PostgreSQL source of truth при
  каждом scrape. Поэтому они отражают общий durable state, а не память одного
  API/worker процесса.
- Правила и пороги хранятся в
  `infra/observability/dentmarket-alert-rules.json`. Monitoring deployment
  переносит поле `promql`, `for`, severity, owner и ссылку на этот runbook без
  изменения смысла порога.

## Общая реакция

1. Подтвердить alert, его окно и release; зафиксировать request/correlation ID,
   но не копировать token, payload или персональные данные.
2. Проверить `/api/health/ready`, доступность PostgreSQL/Redis и последние
   structured logs API и worker.
3. Определить пользовательский impact. Недоступный checkout или массовая
   задержка заказов — SEV-1; единичный import rollback — обычно SEV-2/3.
4. Остановить rollout либо конкретную рискованную операцию. Не удалять outbox,
   import evidence или audit rows для «очистки» метрики.
5. После исправления дождаться полного `for`-окна в healthy state, выполнить
   smoke flow и приложить evidence к incident.

## API errors and checkout

- Сравнить общий 5xx ratio с route
  `/api/carts/:cartId/checkout`; проверить p95/p99 histogram и release.
- По request ID найти безопасный error envelope и structured log.
- Проверить PostgreSQL readiness, конфликт inventory reservation, timeout
  внешнего адаптера и состояние компенсации. Нельзя повторять checkout с новым
  idempotency key, пока неизвестен результат предыдущей транзакции.
- Если ошибка началась после release, остановить rollout. Если затронут только
  внешний provider, отключить соответствующую интеграцию по утверждённой
  процедуре, не переключая production на mock.

## Outbox lag, leases and dead-letter

- Сверить `dentmarket_outbox_events`, возраст `PENDING/FAILED`, expired leases,
  attempts/errors по `event_type` и worker readiness.
- Для expired lease проверить жив ли worker и не превышает ли handler 60 секунд.
  Повторный claim допустим только потому, что handlers идемпотентны.
- `DEAD_LETTER` не удалять и не переводить вручную SQL-командой. До B4.3 replay
  выполняется только утверждённой операторской процедурой с сохранением payload.
- После восстановления убедиться, что oldest age уменьшается, leases равны нулю,
  а обязательные side effects не задублированы.

## Import rollback

- Проверить batch, supplier tenant, `rollbackEvidence`, audit action
  `import.batch.rolled_back` и соответствующий outbox event.
- `ROLLING_BACK` старше пяти минут означает зависшую транзакцию/процесс или
  неконсистентный upgrade path. Не запускайте второй rollback с изменённым reason.
- 409 является защищённым бизнес-конфликтом и сам по себе не формирует alert;
  расследуется 5xx либо застрявший `ROLLING_BACK`.
- После устранения повторить тот же idempotent request, проверить `ROLLED_BACK`,
  search projection и отсутствие второго audit/outbox effect.

## Локальная проверка

```powershell
pnpm verify:observability
```

Команда валидирует unit behavior, правила/пороги, защиту endpoint и реальные
PostgreSQL gauges. Она не доказывает внешнюю доставку alert в production:
маршрут уведомления и synthetic alert проверяются отдельно при deployment.
