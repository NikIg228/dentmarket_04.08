# Deployment profiles

## Назначение

`DEPLOYMENT_PROFILE` управляет реальным NestJS module graph, а не seed-данными
или декоративным feature flag. Без переменной приложение запускается в
fail-safe профиле `pilot`.

| Профиль   | Назначение                            | Runtime surface                                                                                                   |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pilot`   | Controlled demo/pilot                 | Procurement core, catalog, cart, checkout, supplier orders, logistics, documents, notifications, geo и operations |
| `go_live` | Явно утверждённый расширенный runtime | Всё из pilot плюс promotions, billing, AI, trust/reviews и smart recommendations                                  |

В production `DEPLOYMENT_PROFILE=go_live` задаётся только после прохождения
production configuration и provider gates. Сам профиль не превращает mock или
локальный adapter в `LIVE_VERIFIED` интеграцию.

## Машинная проверка

```powershell
npm run verify:pilot-composition
```

Gate строит OpenAPI inventory для явных `pilot`/`go_live` и для отсутствующей
переменной. Он требует:

- [x] безопасный default равен `pilot`;
- [x] pilot не импортирует `PromotionsModule`, `BillingModule`, `AiModule`,
      `TrustCommerceModule` и `SmartRecommendationsModule`;
- [x] pilot не публикует `/promotions`, `/billing`, `/ai`, `/trust` и
      `/recommendations`;
- [x] pilot сохраняет `/geo/addresses`, `/marketplace/search`, cart и checkout;
- [x] go_live содержит все перечисленные optional modules/routes.

## Stop criteria

- forbidden module или route появился в pilot;
- отсутствующая переменная включает `go_live`;
- pilot потерял обязательный procurement route;
- go_live потерял явно поддерживаемую optional surface;
- production окружение полагается на неявный profile default.
