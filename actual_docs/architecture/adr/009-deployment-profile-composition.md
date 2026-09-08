# ADR 009: deployment profile composition

## Статус

Принято.

## Контекст

Product V2 исключает из controlled pilot AI-помощник, billing/tariffs,
платное продвижение, публичный trust score и сложные рекомендации. Ранее
`DEPLOYMENT_PROFILE` проходил validation, но `AppModule` всё равно импортировал
соответствующие Nest modules и регистрировал их controllers. Feature flags в
данных не являлись достаточной runtime-границей: route мог быть вызван, а
provider — создан до проверки флага.

Дополнительно один `TrustCommerceModule` смешивал три разные ответственности:
trust/reviews, географию адресов и smart recommendations. Полное отключение
модуля сломало бы базовый pilot delivery-address flow.

## Решение

1. Отсутствующий `DEPLOYMENT_PROFILE` fail-safe выбирает `pilot`. Production
   обязан явно задавать `DEPLOYMENT_PROFILE=go_live`.
2. `AppModule` всегда импортирует procurement core и отдельный
   `GeoCommerceModule`.
3. `PromotionsModule`, `BillingModule`, `AiModule`, `TrustCommerceModule` и
   `SmartRecommendationsModule` импортируются только при профиле `go_live`.
4. Trust, geo и recommendations разделены на самостоятельные controllers и
   modules без изменения публичных URL.
5. `verify:pilot-composition` строит фактический Swagger route inventory без
   соединения с БД и проверяет три режима: явный `pilot`, явный `go_live` и
   отсутствующую переменную. В pilot запрещённые modules/routes отсутствуют, а
   обязательные geo/search/cart/checkout routes сохраняются.

## Последствия

- Наличие out-of-pilot кода в репозитории больше не экспонирует его в pilot.
- Ошибка optional provider не может помешать созданию pilot Nest graph.
- `go_live` сохраняет текущие URL и возможности, но требует явного deployment
  решения и production configuration gates.
- Frontend-панели AI/promotions/trust должны отдельно скрываться в pilot UI;
  backend отвечает fail-closed отсутствием route и остаётся авторитетной
  границей.
- Добавление нового out-of-pilot модуля требует обновить ADR inventory и
  composition gate в том же change set.
