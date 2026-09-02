# 1С Agent runbook

1. Установить подписанный Agent через installer, проверить checksum и поддерживаемую версию.
2. Создать в 1С отдельного ограниченного пользователя; секрет не хранить в открытом виде.
3. Выполнить одноразовый enrollment, heartbeat и diagnostic report.
4. Настроить mapping складов, видов цен, номенклатуры, контрагентов и статусов заказа.
5. Прогнать 10–50 товаров: каталог, цена, остаток, партия; затем заказ, резерв, подтверждение, отмена и release.
6. Отключить сеть, проверить offline, retry и отсутствие дублей после восстановления.
7. Проверить auto-update/rollback Agent и восстановление после backup.
8. Без реального binary и базы 1С статус остаётся `CONNECTOR_NEEDED`, даже если серверный протокол работает.
## Repository implementation checkpoint — 2026-08-22

The protocol client is available at `packages/one-c-agent`. It intentionally has no 1C database credentials or inbound listener. Implement `OneCSourceAdapter` for the selected 1C configuration, then run the following pilot sequence:

1. Create a `ONE_C` integration connection and rotate its enrollment token through the authenticated supplier API.
2. Run `enroll()` once and store the returned bearer token only in the Agent secret store.
3. Run `heartbeat()` on the returned interval and report adapter errors without secrets.
4. Run `OneCAgentRunner.runOnce()` until catalog, price and inventory child jobs complete.
5. Configure and verify warehouse, variant, price type and counterparty mappings before enabling order export.
6. Confirm the API applies data through freshness/reconciliation/outbox and that repeated pages do not create duplicate internal rows.
7. Keep readiness at `CONNECTOR_NEEDED` until a signed installer, real staging infobase, offline/retry test and full E2E evidence exist.

Agent обязан валидировать результат `OneCSourceAdapter` через общий job contract до отправки в API. Ошибка контракта является permanent (`retryable=false`), а сообщения об ошибках не должны содержать password, token, secret, API key или Authorization credential.
